import fs from 'node:path';
import path from 'node:path';
import { COMFY_HTTP, OUTPUT_DIR, LORAS_ROOT, SESSIONS_ROOT } from '../config/constants.js';
import { debugLog, getSessionLoraPath } from './file-utils.js';
import { getComfyLoraList, refreshComfy } from './comfyui.js';
import { spawnSync } from 'node:child_process';

const clamp = (val, min, max) => Math.min(Math.max(parseFloat(val) || 0, min), max);

export async function buildWorkflowKlein(options) {
  const {
    prompt,
    negativePrompt = 'bad quality, blurry',
    seed = Math.floor(Math.random() * 999999999999),
    width: widthVal = 1024,
    height: heightVal = 1024,
    referenceImages = [],
    unet_name = 'flux-2-klein-9b-Q6_K.gguf',
    steps = 4,
    pp = {},
    loras = [],
    session_id = null
  } = options;

  const width = parseInt(widthVal) || 1024;
  const height = parseInt(heightVal) || 1024;

  let activeUnet = unet_name;
  if (activeUnet.toLowerCase() === 'flux-2-klein-9b-q8_0.gguf') {
    activeUnet = 'flux-2-klein-9b-Q6_K.gguf';
  }
  if (activeUnet.toLowerCase() === 'flux-2-klein-9b-q6_k.gguf') {
    activeUnet = 'flux-2-klein-9b-Q6_K.gguf';
  }

  const STEPS = parseInt(steps) || 4;
  const CFG = 1;

  let allowedLoras = await getComfyLoraList();
  let needsRefresh = false;

  const workflow = {
    '1': { inputs: { gguf_name: activeUnet }, class_type: 'LoaderGGUF' },
    '2': { inputs: { clip_name: 'qwen_3_8b_fp8mixed.safetensors', type: 'flux2' }, class_type: 'ClipLoaderGGUF' },
    '3': { inputs: { vae_name: 'flux2-vae.safetensors' }, class_type: 'VAELoader' },
    '4': { inputs: { text: prompt, clip: ['2', 0] }, class_type: 'CLIPTextEncode' },
    '5': { inputs: { text: negativePrompt, clip: ['2', 0] }, class_type: 'CLIPTextEncode' },
    '11': { inputs: { width, height, batch_size: 1 }, class_type: 'EmptyFlux2LatentImage' },
    '60': { inputs: { noise_seed: seed }, class_type: 'RandomNoise' },
    '61': { inputs: { sampler_name: 'euler' }, class_type: 'KSamplerSelect' },
    '62': { inputs: { steps: STEPS, width, height }, class_type: 'Flux2Scheduler' },
  };

  let modelNode = ['1', 0];
  let clipNode = ['2', 0];
  let nodeId = 100;

  if (loras && Array.isArray(loras) && loras.length > 0) {
    debugLog(`[LORA] Processing ${loras.length} LoRA(s)...`);
    const resolvedQueue = [];
    
    for (const lora of loras) {
      debugLog(`[LORA] Input: name=${lora.name}, filename=${lora.filename}, url=${lora.url}, strength=${lora.strength_model}`);
      const sessionLoraDir = session_id ? getSessionLoraPath(session_id) : LORAS_ROOT;
      let loraPath = null;
      let workflow_lora_name = null;

      const loraFilename = lora.filename || lora.name;

      if (loraFilename && allowedLoras.includes(loraFilename)) {
        console.log(`[LORA] Found in ComfyUI allowed list: ${loraFilename}`);
        workflow_lora_name = loraFilename;
      } else if (loraFilename) {
        const sessionPath = path.join(sessionLoraDir, loraFilename);
        const globalPath = path.join(LORAS_ROOT, loraFilename);

        if (fs.existsSync(globalPath)) {
          loraPath = globalPath;
        } else if (fs.existsSync(sessionPath)) {
          loraPath = sessionPath;
        }
      }

      if (!loraPath && lora.url) {
        console.log(`[LORA] Downloading for session: ${lora.url}`);
        const result = spawnSync('python', ['tools/lora_downloader.py', lora.url, sessionLoraDir], { encoding: 'utf8' });
        if (result.status === 0) {
          try {
            const data = JSON.parse(result.stdout);
            if (data.success) loraPath = data.path;
          } catch (e) { }
        }
      }

      if (loraPath && fs.existsSync(loraPath)) {
        const filename = path.basename(loraPath);
        const isInSession = loraPath.includes(path.join(SESSIONS_ROOT, session_id || 'MISSING'));

        if (isInSession && session_id) {
          workflow_lora_name = `sess_${session_id}_${filename}`;
          const symPath = path.join(LORAS_ROOT, workflow_lora_name);
          if (!fs.existsSync(symPath)) {
            try {
              fs.symlinkSync(loraPath, symPath, 'file');
              console.log(`[LORA] Created symlink: ${workflow_lora_name}`);
              needsRefresh = true;
            } catch (e) {
              try {
                fs.linkSync(loraPath, symPath);
                console.log(`[LORA] Created hardlink (fallback): ${workflow_lora_name}`);
                needsRefresh = true;
              } catch (e2) {
                console.error(`[LORA] LINKING FAILED for ${filename}: ${e2.message}. Falling back to absolute path.`);
                workflow_lora_name = loraPath;
              }
            }
          } else {
            console.log(`[LORA] Link already exists: ${workflow_lora_name}`);
          }
        } else {
          workflow_lora_name = loraFilename || filename;
          console.log(`[LORA] Using global/direct name: ${workflow_lora_name}`);
        }
      }
      resolvedQueue.push({ config: lora, workflow_name: workflow_lora_name });
    }

    if (needsRefresh) {
      console.log('[LORA] Changes detected, triggering ComfyUI refresh...');
      await refreshComfy();

      let retryCount = 0;
      const maxRetries = 15;
      let allFound = false;

      while (retryCount < maxRetries) {
        process.stdout.write(`[LORA] Polling ComfyUI (attempt ${retryCount + 1}/${maxRetries})... `);
        const currentList = await getComfyLoraList();
        const missing = resolvedQueue
          .filter(item => item.workflow_name && !currentList.includes(item.workflow_name))
          .map(item => item.workflow_name);

        if (missing.length === 0) {
          allFound = true;
          console.log('OK!');
          break;
        }

        console.log(`WAITING for: ${missing.join(', ')}`);
        await new Promise(r => setTimeout(r, 1000));
        retryCount++;
      }

      if (!allFound) {
        console.warn('[LORA] CRITICAL: Some LoRAs were not recognized by ComfyUI within 15s. Prompt may fail.');
      }
    }

    for (const item of resolvedQueue) {
      const { config, workflow_name } = item;
      if (workflow_name) {
        const loraLoaderId = (nodeId++).toString();
        const s_model = (config.strength_model !== undefined) ? parseFloat(config.strength_model) :
          ((config.strength !== undefined) ? parseFloat(config.strength) : 1.0);
        const s_clip = (config.strength_clip !== undefined) ? parseFloat(config.strength_clip) :
          ((config.strength !== undefined) ? parseFloat(config.strength) : 1.0);

        debugLog(`[LORA] Injecting Node ${loraLoaderId}: ${workflow_name} (M:${s_model}, C:${s_clip})`);

        if (path.isAbsolute(workflow_name)) {
          console.warn(`[LORA] WARNING: Passing absolute path for LoRA: ${workflow_name}. Standard LoraLoader might reject this.`);
        }

        workflow[loraLoaderId] = {
          inputs: {
            lora_name: workflow_name,
            strength_model: s_model,
            strength_clip: s_clip,
            model: modelNode,
            clip: clipNode
          },
          class_type: 'LoraLoader'
        };
        modelNode = [loraLoaderId, 0];
        clipNode = [loraLoaderId, 1];
      }
    }
  }

  workflow['4'].inputs.clip = clipNode;
  workflow['5'].inputs.clip = clipNode;

  let positiveCondNode = ['4', 0];
  let negativeCondNode = ['5', 0];

  referenceImages.forEach((imagePath) => {
    if (!imagePath || typeof imagePath !== 'string') {
      console.warn(`[WORKFLOW] Skipping invalid reference image path: ${imagePath}`);
      return;
    }
    const loadId = nodeId++;
    const scaleId = nodeId++;
    const encodeId = nodeId++;
    const refPosId = nodeId++;
    const refNegId = nodeId++;

    workflow[loadId] = { inputs: { image: imagePath }, class_type: 'LoadImage' };
    workflow[scaleId] = { inputs: { image: [loadId.toString(), 0], upscale_method: 'nearest-exact', megapixels: 1, resolution_steps: 8 }, class_type: 'ImageScaleToTotalPixels' };
    workflow[encodeId] = { inputs: { pixels: [scaleId.toString(), 0], vae: ['3', 0] }, class_type: 'VAEEncode' };

    workflow[refPosId] = { inputs: { conditioning: positiveCondNode, latent: [encodeId.toString(), 0] }, class_type: 'ReferenceLatent' };
    workflow[refNegId] = { inputs: { conditioning: negativeCondNode, latent: [encodeId.toString(), 0] }, class_type: 'ReferenceLatent' };

    positiveCondNode = [refPosId.toString(), 0];
    negativeCondNode = [refNegId.toString(), 0];
  });

  workflow['63'] = { inputs: { cfg: CFG, model: modelNode, positive: positiveCondNode, negative: negativeCondNode }, class_type: 'CFGGuider' };
  workflow['6'] = { inputs: { noise: ['60', 0], guider: ['63', 0], sampler: ['61', 0], sigmas: ['62', 0], latent_image: ['11', 0] }, class_type: 'SamplerCustomAdvanced' };
  workflow['7'] = { inputs: { samples: ['6', 0], vae: ['3', 0] }, class_type: 'VAEDecode' };

  let lastImageNode = ['7', 0];

  const exposure = pp.exposure !== undefined ? pp.exposure : 0;
  const contrast = pp.contrast !== undefined ? pp.contrast : 1.0;
  const saturation = pp.saturation !== undefined ? pp.saturation : 1.0;
  const vibrance = pp.vibrance !== undefined ? pp.vibrance : 0;
  const enableLevels = (exposure !== 0 || contrast !== 1.0 || saturation !== 1.0 || vibrance !== 0);

  workflow['20'] = {
    inputs: {
      image: lastImageNode,
      enable_upscale: false,
      upscale_model_path: '4x_foolhardy_Remacri.pth',
      downscale_by: 1,
      rescale_method: 'lanczos',
      precision: 'auto',
      batch_size: 1,
      enable_levels: enableLevels,
      exposure: clamp(pp.exposure, -0.5, 0.5),
      contrast: clamp(pp.contrast !== undefined ? pp.contrast : 1.0, 0.5, 2.0),
      saturation: clamp(pp.saturation !== undefined ? pp.saturation : 1.0, 0.0, 2.0),
      vibrance: clamp(pp.vibrance, -0.5, 0.5),
      enable_color_wheels: false,
      lift_r: 0, lift_g: 0, lift_b: 0,
      gamma_r: 1, gamma_g: 1, gamma_b: 1,
      gain_r: 1, gain_g: 1, gain_b: 1,
      enable_temp_tint: (pp.temp || 0) !== 0 || (pp.tint || 0) !== 0,
      temperature: clamp(pp.temp, -0.5, 0.5),
      tint: clamp(pp.tint, -0.5, 0.5),
      enable_sharpen: (pp.sharpness || 0) > 0,
      sharpen_strength: clamp(pp.sharpness, 0, 1),
      sharpen_radius: 1.85,
      sharpen_threshold: 0.015,
      enable_vignette: (pp.vignette || 0) > 0,
      vignette_strength: clamp(pp.vignette, 0, 1),
      vignette_radius: 0.7,
      vignette_softness: 2,
      enable_film_grain: (pp.grain_amount || 0) > 0,
      grain_intensity: clamp(pp.grain_amount, 0, 1) * 0.15,
      grain_size: clamp(pp.grain_size, 0.25, 4.0),
      grain_color_amount: 0.044,
      gamma: 1,
      brightness: 0,
      enable_small_glow: (pp.glow_small_intensity || 0) > 0,
      small_glow_intensity: clamp(pp.glow_small_intensity, 0, 1),
      small_glow_radius: clamp(pp.glow_small_radius, 0, 0.2),
      small_glow_threshold: clamp(pp.glow_small_threshold, 0, 1),
      enable_large_glow: (pp.glow_large_intensity || 0) > 0,
      large_glow_intensity: clamp(pp.glow_large_intensity, 0, 1),
      large_glow_radius: clamp(pp.glow_large_radius, 30, 100),
      large_glow_threshold: clamp(pp.glow_large_threshold, 0, 1),
      enable_glare: (pp.glare_intensity || 0) > 0,
      glare_type: pp.glare_type || 'star_4',
      glare_intensity: clamp(pp.glare_intensity, 0, 1),
      glare_length: clamp(pp.glare_length, 1, 3),
      glare_angle: clamp(pp.glare_angle, 0, 180),
      glare_threshold: clamp(pp.glare_threshold, 0, 1),
      glare_quality: 16,
      glare_ray_width: 1,
      enable_chromatic_aberration: (pp.ca_strength || 0) > 0,
      ca_strength: clamp(pp.ca_strength, 0, 0.1),
      ca_edge_falloff: 2,
      enable_ca_hue_shift: false,
      ca_hue_shift_degrees: 0,
      enable_radial_blur: (pp.radial_blur_type !== 'none' && (pp.radial_blur_strength || 0) > 0),
      radial_blur_type: pp.radial_blur_type || 'spin',
      radial_blur_strength: clamp(pp.radial_blur_strength, 0, 0.5),
      radial_blur_center_x: 0.5,
      radial_blur_center_y: 0.5,
      radial_blur_falloff: 0.05,
      radial_blur_samples: 16,
      enable_lens_distortion: (pp.lens_distortion || 0) !== 0,
      barrel_distortion: clamp(pp.lens_distortion, -0.2, 0.2),
      postprocess_ui: ''
    },
    class_type: 'CRT Post-Process Suite'
  };
  lastImageNode = ['20', 0];

  workflow['Save'] = { inputs: { filename_prefix: 'AIEGO', images: lastImageNode }, class_type: 'SaveImage' };
  debugLog(`[WORKFLOW] Built workflow for session ${session_id} with ${Object.keys(workflow).length} nodes.`);
  return workflow;
}
