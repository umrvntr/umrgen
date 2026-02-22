import fetch from 'node-fetch';
import WebSocket from 'ws';
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { COMFY_HTTP, COMFY_WS, OUTPUT_DIR, PRO_SECRET, MASTER_PRO_KEY, LIMITED_PRO_KEY, LIMITED_PRO_LIMIT } from '../config/constants.js';
import { debugLog, validateOutputFilename } from './file-utils.js';
import { GLOBAL_QUEUE, COMPLETED_TIMES, JOB_STREAMS, broadcastToJob, getAverageGenTime } from './queue.js';

export async function getComfyLoraList() {
  try {
    const response = await fetch(`${COMFY_HTTP}/object_info/LoraLoader`);
    if (response.ok) {
      const data = await response.json();
      return data.LoraLoader.input.required.lora_name[0] || [];
    }
  } catch (e) {
    console.warn(`[COMFY] Failed to fetch LoRA list: ${e.message}`);
  }
  return [];
}

export async function refreshComfy() {
  try {
    const resp = await fetch(`${COMFY_HTTP}/refresh`, { method: 'POST' });
    if (resp.ok) {
      console.log('[COMFY] Standard refresh triggered correctly.');
    } else {
      await fetch(`${COMFY_HTTP}/extra_model_paths`, { method: 'POST' });
      console.log('[COMFY] Triggered extra_model_paths fallback refresh.');
    }
  } catch (e) {
    console.warn(`[COMFY] Failed to refresh models: ${e.message}`);
  }
}

export async function checkComfyConnection() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${COMFY_HTTP}/system_stats`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (resp.ok) {
      console.log(`[COMFY] Connected to ${COMFY_HTTP}`);
      return true;
    }
  } catch (e) {
    console.error(`[COMFY] ERROR: Cannot connect to ComfyUI at ${COMFY_HTTP}`);
    console.error(`[COMFY] Please ensure ComfyUI is running`);
    console.error(`[COMFY] Error: ${e.message}`);
  }
  return false;
}

export async function queuePrompt(workflow) {
  const clientId = randomUUID();
  debugLog(`[COMFY] Sending prompt with client_id ${clientId}...`);
  const resp = await fetch(`${COMFY_HTTP}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId })
  });
  if (!resp.ok) {
    const errorText = await resp.text();
    debugLog(`[COMFY] Prompt FAIL: ${errorText}`);
    throw new Error(errorText);
  }
  const data = await resp.json();
  debugLog(`[COMFY] Prompt Queued: ${data.prompt_id}`);
  return { promptId: data.prompt_id, clientId };
}

export async function waitForCompletion(promptId, clientId, jobId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${COMFY_WS}?clientId=${clientId}`);
    debugLog(`[COMFY] WS Connecting for client ${clientId}...`);
    let completed = false;
    
    ws.on('open', () => debugLog(`[COMFY] WS Connected for client ${clientId}`));
    
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'executing' && msg.data.node === null && msg.data.prompt_id === promptId) {
          debugLog(`[COMFY] Prompt ${promptId} completed execution`);
          completed = true;
          ws.close();
        }
        if (msg.type === 'progress' && msg.data.prompt_id === promptId) {
          debugLog(`[COMFY] Progress: ${msg.data.value}/${msg.data.max}`);
          broadcastToJob(jobId, { type: 'progress', step: msg.data.value, total: msg.data.max });
        }
      } catch (e) {
        debugLog(`[COMFY] WS Error parsing message: ${e.message}`);
        if (data instanceof Buffer || (typeof data === 'object' && data.length)) {
          const base64 = data.toString('base64');
          broadcastToJob(jobId, { type: 'preview', image: base64 });
        }
      }
    });
    
    ws.on('close', () => completed ? resolve() : reject(new Error('WebSocket closed before completion signal')));
    ws.on('error', (err) => reject(err));
    
    setTimeout(() => {
      if (!completed) {
        ws.close();
        reject(new Error('Timeout waiting for prompt completion'));
      }
    }, 600000);
  });
}

export async function getImage(filename, subfolder, type) {
  if (filename && (filename.includes('..') || filename.includes('/') || filename.includes('\\'))) {
    throw new Error('Invalid filename');
  }
  const params = new URLSearchParams({ filename, subfolder: subfolder || '', type: type || 'output' });
  const resp = await fetch(`${COMFY_HTTP}/view?${params}`);
  if (!resp.ok) throw new Error('Failed to get image');
  return resp.arrayBuffer();
}

export async function processComfyOutputs(promptId, session_id) {
  const history = await fetch(`${COMFY_HTTP}/history/${promptId}`).then(r => r.json());
  const outputs = history[promptId]?.outputs;
  if (!outputs) return [];

  const images = [];
  for (const key in outputs) {
    if (outputs[key].images) {
      for (const img of outputs[key].images) {
        const arrayBuffer = await getImage(img.filename, img.subfolder, img.type);
        const name = `umrgen_${Math.floor(100000 + Math.random() * 900000)}.png`;

        let saveDir = OUTPUT_DIR;
        let webPathPrefix = '/outputs';

        if (session_id) {
          saveDir = path.join(OUTPUT_DIR, session_id);
          if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
          webPathPrefix = `/outputs/${session_id}`;
        }

        fs.writeFileSync(path.join(saveDir, name), Buffer.from(arrayBuffer));
        const sessionQuery = session_id ? `?session_id=${encodeURIComponent(session_id)}` : '';
        images.push({ url: `${webPathPrefix}/${name}${sessionQuery}` });
      }
    }
  }
  debugLog(`[COMFY] Processed outputs for ${promptId}: found ${images.length} images`);
  return images;
}

export function generateProToken(plan = 'pro', options = {}) {
  const payload = JSON.parse(JSON.stringify({ plan, exp: Date.now() + (30 * 24 * 60 * 60 * 1000) }));
  if (Number.isFinite(options.limit) && options.limit > 0) payload.limit = options.limit;
  if (options.key) payload.key = options.key;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = createHmac('sha256', PRO_SECRET).update(body).digest('base64');
  return `${body}.${signature}`;
}

export function verifyProToken(token) {
  if (!token) return { plan: 'free' };
  try {
    const [body, sig] = token.split('.');
    const expectedSig = createHmac('sha256', PRO_SECRET).update(body).digest('base64');
    if (sig !== expectedSig) return { plan: 'free' };
    const payload = JSON.parse(Buffer.from(body, 'base64').toString());
    if (payload.exp < Date.now()) return { plan: 'free' };
    return payload;
  } catch (e) {
    return { plan: 'free' };
  }
}

export function consumeLimitedProUse(token, limit) {
  if (!token || !Number.isFinite(limit) || limit <= 0) return null;
  if (!LIMITED_PRO_USAGE.has(token)) {
    LIMITED_PRO_USAGE.set(token, limit);
  }
  const remaining = LIMITED_PRO_USAGE.get(token) || 0;
  if (remaining <= 0) return { allowed: false, remaining: 0, limit };
  const next = remaining - 1;
  LIMITED_PRO_USAGE.set(token, next);
  return { allowed: true, remaining: next, limit };
}
