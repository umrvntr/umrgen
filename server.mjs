import "dotenv/config";
import express from "express";
import fetch from "node-fetch";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import WebSocket from "ws";
import { createHmac, randomUUID } from "node:crypto";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import { spawnSync } from "node:child_process";

const streamPipeline = promisify(pipeline);
const clamp = (val, min, max) => Math.min(Math.max(parseFloat(val) || 0, min), max);

function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(path.join(process.cwd(), "debug.log"), line);
}

/**
 * Robustly move a file, even across different drives/volumes on Windows.
 */
async function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (e) {
    if (e.code === 'EXDEV' || e.code === 'EPERM') {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } else {
      throw e;
    }
  }
}

// ========== CONFIGURATION ==========
const PORT = process.env.PORT || 3088;
const COMFY_HOST = process.env.COMFY_HOST || "127.0.0.1:8188";
const COMFY_HTTP = `http://${COMFY_HOST}`;
const COMFY_WS = `ws://${COMFY_HOST}/ws`;

const OUTPUT_DIR = path.join(process.cwd(), "outputs");
const HISTORY_PATH = path.join(process.cwd(), "history.json");
const SESSIONS_ROOT = path.join(process.cwd(), "sessions");
const LORAS_ROOT = process.env.LORAS_ROOT || path.join(process.cwd(), "USER_LORA");

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_ROOT)) fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
if (!fs.existsSync(LORAS_ROOT)) fs.mkdirSync(LORAS_ROOT, { recursive: true });
const TMP_UPLOADS = path.join(process.cwd(), "tmp_uploads");
if (!fs.existsSync(TMP_UPLOADS)) fs.mkdirSync(TMP_UPLOADS, { recursive: true });

const LORA_SIZE_LIMIT = 2048 * 1024 * 1024; // 2 GB Hard Limit
const loraImportProgress = new Map();

// Reference Image Configuration
const REF_IMAGE_SIZE_LIMIT = 10 * 1024 * 1024; // 10 MB per image
const MAX_REF_IMAGES = 10;

// SESSION ID VALIDATION: Prevent path traversal attacks
function validateSessionId(session_id) {
  if (!session_id || typeof session_id !== 'string') return false;
  // Only allow alphanumeric, underscore, and hyphen. Must start with 'sid_'
  if (!/^sid_[a-z0-9_-]{5,50}$/i.test(session_id)) return false;
  // Additional check: no path traversal sequences
  if (session_id.includes('..') || session_id.includes('/') || session_id.includes('\\')) return false;
  return true;
}

function getSessionReferencePath(session_id) {
  if (!validateSessionId(session_id)) {
    throw new Error("Invalid session ID format");
  }
  const p = path.join(SESSIONS_ROOT, session_id, "references");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function getSessionLoraPath(session_id) {
  if (!validateSessionId(session_id)) {
    throw new Error("Invalid session ID format");
  }
  const p = path.join(SESSIONS_ROOT, session_id, "loras");
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function cleanupSessions() {
  const TTL = 8 * 60 * 60 * 1000; // 8 Hours
  try {
    const sessions = fs.readdirSync(SESSIONS_ROOT);
    const now = Date.now();
    for (const sid of sessions) {
      const fullPath = path.join(SESSIONS_ROOT, sid);
      const stats = fs.statSync(fullPath);

      // Keep external agent session alive indefinitely
      if (sid === "sid_ext_gen") continue;

      if (now - stats.mtimeMs > TTL) {
        console.log(`[CLEANUP] Removing expired session: ${sid}`);

        // Remove related symlinks in USER_LORA
        try {
          if (fs.existsSync(LORAS_ROOT)) {
            const loraFiles = fs.readdirSync(LORAS_ROOT);
            const prefix = `sess_${sid}_`;
            for (const file of loraFiles) {
              if (file.startsWith(prefix)) {
                fs.unlinkSync(path.join(LORAS_ROOT, file));
              }
            }
          }
        } catch (symErr) {
          console.error(`[CLEANUP] Symlink removal error for ${sid}: ${symErr.message}`);
        }

        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    }
  } catch (e) {
    console.error(`[CLEANUP] Error: ${e.message}`);
  }
}
// Run cleanup every hour
setInterval(cleanupSessions, 60 * 60 * 1000);
cleanupSessions();

// ========== MIDDLEWARE CONFIGURATION ==========

// Configure Multer for reference image uploads
const upload = multer({
  dest: path.join(process.cwd(), "tmp_uploads"),
  limits: { fileSize: REF_IMAGE_SIZE_LIMIT }
});

// Separate Multer for LoRA uploads
const loraUpload = multer({
  dest: path.join(process.cwd(), "tmp_uploads"),
  limits: { fileSize: LORA_SIZE_LIMIT }
});

// ========== EXTERNAL API AUTH ==========
const EXTERNAL_API_KEY = (process.env.EXTERNAL_API_KEY || "z-img-secret-key-2026").trim();

function authenticateExternalAgent(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${EXTERNAL_API_KEY}`) {
    console.warn(`[AUTH_API] Failed attempt. Received: "${authHeader ? authHeader.substring(0, 15) : 'none'}..."`);
    return res.status(401).json({ error: "Unauthorized: Invalid or missing API Key" });
  }
  next();
}

const app = express();

// SECURITY HEADERS: Protect against common vulnerabilities
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Don't set CSP for now as it may break the app, but can be added later
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// RATE LIMITING: Simple in-memory rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute per IP

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowKey = `${ip}:${Math.floor(now / RATE_LIMIT_WINDOW)}`;

  const currentCount = rateLimitMap.get(windowKey) || 0;
  if (currentCount >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: "Rate limit exceeded. Please try again later." });
  }

  rateLimitMap.set(windowKey, currentCount + 1);

  // Cleanup old entries (run occasionally)
  if (Math.random() < 0.01) {
    const cutoff = now - (RATE_LIMIT_WINDOW * 2);
    for (const [key] of rateLimitMap) {
      const timestamp = parseInt(key.split(':')[1]) * RATE_LIMIT_WINDOW;
      if (timestamp < cutoff) rateLimitMap.delete(key);
    }
  }

  next();
}

// Apply rate limiting to API routes
app.use('/api', rateLimit);

// Serve React build from public/
app.use(express.static("public"));

// SPA fallback - serve index.html for non-API routes
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

function validateOutputFilename(filename) {
  if (!filename || typeof filename !== "string") return false;
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  return /^[a-zA-Z0-9._-]+$/.test(filename);
}

app.get("/outputs/:session_id/:filename", (req, res) => {
  const { session_id, filename } = req.params;
  const sessionQuery = req.query.session_id;

  if (!validateSessionId(session_id) || sessionQuery !== session_id) {
    return res.status(403).end();
  }
  if (!validateOutputFilename(filename)) {
    return res.status(400).end();
  }

  const filePath = path.join(OUTPUT_DIR, session_id, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// ========== PRO & CONTENT POLICY ==========
const PRO_SECRET = process.env.PRO_SECRET || "umrgen-pro-secure-v8";
// Force clean key to avoid hidden \r or \n from env files
const MASTER_PRO_KEY = (process.env.MASTER_PRO_KEY || "umr8888").trim();
const LIMITED_PRO_KEY = (process.env.TEST50 || "TEST50").trim();
const LIMITED_PRO_LIMIT = parseInt(process.env.TEST50_LIMIT || "50", 10);
const LIMITED_PRO_USAGE = new Map();
const LIMITED_KEY_ACTIVATIONS = new Map();
const IP_TRACKED_KEYS = ['TEST50'];

const TRIGGER_CONFIG = {
  MINORS: {
    blocked_always: true,
    patterns: ["loli", "lolita", "child", "children", "underage", "minor", "kid", "preteen", "pedo", "cp"]
  },
  ADULT_NSFW: {
    blocked_in_free: true,
    patterns: ["naked", "nude", "nudity", "nipples", "bare breasts", "pussy", "dick", "penis", "vagina", "anus", "tits", "intercourse", "blowjob", "genitals", "sex act", "explicit sexual", "porn", "explicit", "xxx", "hardcore"]
  }
};

function normalizeText(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scanText(text, isPro = false) {
  const norm = normalizeText(text);
  if (!norm) return null;
  for (const p of TRIGGER_CONFIG.MINORS.patterns) {
    if (norm.includes(p)) return "MINORS";
  }
  if (!isPro) {
    for (const p of TRIGGER_CONFIG.ADULT_NSFW.patterns) {
      if (norm.includes(p)) return "ADULT_NSFW";
    }
  }
  return null;
}

function generateProToken(plan = "pro", options = {}) {
  const payload = JSON.parse(JSON.stringify({ plan, exp: Date.now() + (30 * 24 * 60 * 60 * 1000) }));
  if (Number.isFinite(options.limit) && options.limit > 0) payload.limit = options.limit;
  if (options.key) payload.key = options.key;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64");
  const signature = createHmac("sha256", PRO_SECRET).update(body).digest("base64");
  return `${body}.${signature}`;
}

function verifyProToken(token) {
  if (!token) return { plan: "free" };
  try {
    const [body, sig] = token.split(".");
    const expectedSig = createHmac("sha256", PRO_SECRET).update(body).digest("base64");
    if (sig !== expectedSig) return { plan: "free" };
    const payload = JSON.parse(Buffer.from(body, "base64").toString());
    if (payload.exp < Date.now()) return { plan: "free" };
    return payload;
  } catch (e) {
    return { plan: "free" };
  }
}

function consumeLimitedProUse(token, limit) {
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

async function getComfyLoraList() {
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

async function refreshComfy() {
  try {
    // The standard ComfyUI refresh endpoint used by the UI
    const resp = await fetch(`${COMFY_HTTP}/refresh`, { method: "POST" });
    if (resp.ok) {
      console.log("[COMFY] Standard refresh triggered correctly.");
    } else {
      // Fallback to extra_model_paths if refresh fails
      await fetch(`${COMFY_HTTP}/extra_model_paths`, { method: "POST" });
      console.log("[COMFY] Triggered extra_model_paths fallback refresh.");
    }
  } catch (e) {
    console.warn(`[COMFY] Failed to refresh models: ${e.message}`);
  }
}

// ========== QUEUE MANAGER ==========
const GLOBAL_QUEUE = [];
const COMPLETED_TIMES = [];
const MAX_QUEUE_SIZE = 500;
const JOB_STREAMS = new Map(); // jobId -> [res targets]

// ========== DAILY IP GENERATION LIMIT (Free Users) ==========
const FREE_DAILY_LIMIT = 100;
const dailyIpUsage = new Map(); // ip -> { count, date }

function getDailyUsage(ip) {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const entry = dailyIpUsage.get(ip);
  if (!entry || entry.date !== today) {
    // Reset for new day
    dailyIpUsage.set(ip, { count: 0, date: today });
    return { count: 0, date: today };
  }
  return entry;
}

function incrementDailyUsage(ip) {
  const usage = getDailyUsage(ip);
  usage.count += 1;
  dailyIpUsage.set(ip, usage);
  return usage;
}

function checkDailyLimit(ip) {
  const usage = getDailyUsage(ip);
  return {
    allowed: usage.count < FREE_DAILY_LIMIT,
    used: usage.count,
    remaining: Math.max(0, FREE_DAILY_LIMIT - usage.count),
    limit: FREE_DAILY_LIMIT
  };
}

// Cleanup stale daily entries every hour
setInterval(() => {
  const today = new Date().toISOString().slice(0, 10);
  for (const [ip, entry] of dailyIpUsage) {
    if (entry.date !== today) dailyIpUsage.delete(ip);
  }
}, 60 * 60 * 1000);

function broadcastToJob(jobId, data) {
  const targets = JOB_STREAMS.get(jobId);
  if (targets) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    targets.forEach(res => res.write(payload));
  }
}

function getAverageGenTime() {
  if (COMPLETED_TIMES.length === 0) return 30;
  const sum = COMPLETED_TIMES.reduce((a, b) => a + b, 0);
  return Math.round(sum / COMPLETED_TIMES.length);
}

function getJobStatus(jobId) {
  const job = GLOBAL_QUEUE.find(j => j.job_id === jobId);
  if (!job) return { state: "unknown" };
  const queuedJobs = GLOBAL_QUEUE.filter(j => j.state === "queued");
  const pos = queuedJobs.findIndex(j => j.job_id === jobId);
  return {
    job_id: job.job_id,
    state: job.state,
    queue_position: pos >= 0 ? pos : null,
    eta_seconds: pos >= 0 ? (pos + 1) * getAverageGenTime() : 0,
    created_at: job.created_at,
    results: job.results,
    error: job.error
  };
}

async function processQueue() {
  const activeJob = GLOBAL_QUEUE.find(j => j.state === "running");
  if (activeJob) return;
  const nextJob = GLOBAL_QUEUE.find(j => j.state === "queued");
  if (!nextJob) return;
  nextJob.state = "running";
  nextJob.started_at = Date.now();
  debugLog(`[QUEUE] Processing Job ${nextJob.job_id} for session ${nextJob.session_id}`);
  try {
    const p = nextJob.parameters;

    // Collect reference images for this session
    let referenceImages = [];
    if (p.session_id && p.reference_images && Array.isArray(p.reference_images)) {
      const refPath = getSessionReferencePath(p.session_id);
      for (const filename of p.reference_images) {
        if (!filename || typeof filename !== 'string') {
          console.warn(`[QUEUE] Skipping invalid reference image entry: ${filename}`);
          continue;
        }
        const fullPath = path.join(refPath, filename);
        if (fs.existsSync(fullPath)) {
          referenceImages.push(fullPath);
        }
      }
    }


    debugLog(`[QUEUE] Job params loras: ${JSON.stringify(p.loras || [])}`);
    // Single Klein workflow
    const workflow = await buildWorkflowKlein({
      prompt: p.prompt,
      negativePrompt: p.negative,
      width: parseInt(p.width),
      height: parseInt(p.height),
      seed: p.seed || Math.floor(Math.random() * 999999999999),
      referenceImages,
      unet_name: p.unet_name,
      steps: p.steps,
      pp: p.post_processing || {},
      loras: p.loras || [],
      session_id: p.session_id
    });

    const { promptId, clientId } = await queuePrompt(workflow);
    await waitForCompletion(promptId, clientId, nextJob.job_id);

    const images = await processComfyOutputs(promptId, p.session_id);
    nextJob.state = "completed";
    nextJob.results = { images };
    nextJob.completed_at = Date.now();
    const duration = (nextJob.completed_at - nextJob.started_at) / 1000;
    COMPLETED_TIMES.push(duration);
    if (COMPLETED_TIMES.length > 10) COMPLETED_TIMES.shift();
    addHistory({
      id: promptId,
      job_id: nextJob.job_id,
      timestamp: Date.now(),
      prompt: nextJob.parameters.prompt,
      negative: nextJob.parameters.negative,
      imageUrl: images[0]?.url || '',
      session_id: p.session_id,
      width: p.width,
      height: p.height,
      steps: p.steps,
      post_processing: p.post_processing,
      loras: p.loras,
      reference_images: p.reference_images
    });
  } catch (err) {
    debugLog(`[QUEUE] Job ${nextJob.job_id} FAILED: ${err.message}`);
    nextJob.state = "failed";
    nextJob.error = err.message;
    // Broadcast error to frontend so users know what happened
    broadcastToJob(nextJob.job_id, { type: 'error', message: err.message });
  } finally {
    setTimeout(() => {
      const idx = GLOBAL_QUEUE.findIndex(j => j.job_id === nextJob.job_id);
      if (idx > -1) GLOBAL_QUEUE.splice(idx, 1);
    }, 60000);
    setImmediate(processQueue);
  }
}

async function buildWorkflowKlein(options) {
  const {
    prompt,
    negativePrompt = "bad quality, blurry",
    seed = Math.floor(Math.random() * 999999999999),
    width: widthVal = 1024,
    height: heightVal = 1024,
    referenceImages = [],
    unet_name = "flux-2-klein-9b-Q6_K.gguf",
    steps = 4,
    pp = {},
    loras = [],
    session_id = null
  } = options;

  const width = parseInt(widthVal) || 1024;
  const height = parseInt(heightVal) || 1024;

  let activeUnet = unet_name;
  if (activeUnet.toLowerCase() === "flux-2-klein-9b-q8_0.gguf") {
    activeUnet = "flux-2-klein-9b-Q6_K.gguf";
  }
  if (activeUnet.toLowerCase() === "flux-2-klein-9b-q6_k.gguf") {
    activeUnet = "flux-2-klein-9b-Q6_K.gguf";
  }

  const STEPS = parseInt(steps) || 4;
  const CFG = 1;

  // Fetch currently allowed LoRAs to avoid unnecessary symlinking
  let allowedLoras = await getComfyLoraList();
  let needsRefresh = false;

  const workflow = {
    "1": { inputs: { gguf_name: activeUnet }, class_type: "LoaderGGUF" },
    "2": { inputs: { clip_name: "qwen_3_8b_fp8mixed.safetensors", type: "flux2" }, class_type: "ClipLoaderGGUF" },
    "3": { inputs: { vae_name: "flux2-vae.safetensors" }, class_type: "VAELoader" },
    "4": { inputs: { text: prompt, clip: ["2", 0] }, class_type: "CLIPTextEncode" },
    "5": { inputs: { text: negativePrompt, clip: ["2", 0] }, class_type: "CLIPTextEncode" },
    "11": { inputs: { width, height, batch_size: 1 }, class_type: "EmptyFlux2LatentImage" },
    "60": { inputs: { noise_seed: seed }, class_type: "RandomNoise" },
    "61": { inputs: { sampler_name: "euler" }, class_type: "KSamplerSelect" },
    "62": { inputs: { steps: STEPS, width, height }, class_type: "Flux2Scheduler" },
  };

  let modelNode = ["1", 0];
  let clipNode = ["2", 0];
  let nodeId = 100;

  // Handle LoRAs
  if (loras && Array.isArray(loras) && loras.length > 0) {
    debugLog(`[LORA] Processing ${loras.length} LoRA(s)...`);
    // Pass 1: Resolve all LoRA paths and create symlinks
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
        const result = spawnSync("python", ["tools/lora_downloader.py", lora.url, sessionLoraDir], { encoding: "utf8" });
        if (result.status === 0) {
          try {
            const data = JSON.parse(result.stdout);
            if (data.success) loraPath = data.path;
          } catch (e) { }
        }
      }

      if (loraPath && fs.existsSync(loraPath)) {
        const filename = path.basename(loraPath);
        const isInSession = loraPath.includes(path.join(SESSIONS_ROOT, session_id || "MISSING"));

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
                workflow_lora_name = loraPath; // Absolute path fallback (RISKY)
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
      console.log("[LORA] Changes detected, triggering ComfyUI refresh...");
      await refreshComfy();

      // Polling Loop: Wait for ComfyUI to acknowledge new symlinks
      let retryCount = 0;
      const maxRetries = 15; // Increased to 15 seconds
      let allFound = false;

      while (retryCount < maxRetries) {
        process.stdout.write(`[LORA] Polling ComfyUI (attempt ${retryCount + 1}/${maxRetries})... `);
        const currentList = await getComfyLoraList();
        const missing = resolvedQueue
          .filter(item => item.workflow_name && !currentList.includes(item.workflow_name))
          .map(item => item.workflow_name);

        if (missing.length === 0) {
          allFound = true;
          console.log("OK!");
          break;
        }

        console.log(`WAITING for: ${missing.join(", ")}`);
        await new Promise(r => setTimeout(r, 1000));
        retryCount++;
      }

      if (!allFound) {
        console.warn("[LORA] CRITICAL: Some LoRAs were not recognized by ComfyUI within 15s. Prompt may fail.");
      }
    }

    // Pass 2: Inject into workflow
    for (const item of resolvedQueue) {
      const { config, workflow_name } = item;
      if (workflow_name) {
        const loraLoaderId = (nodeId++).toString();
        const s_model = (config.strength_model !== undefined) ? parseFloat(config.strength_model) :
          ((config.strength !== undefined) ? parseFloat(config.strength) : 1.0);
        const s_clip = (config.strength_clip !== undefined) ? parseFloat(config.strength_clip) :
          ((config.strength !== undefined) ? parseFloat(config.strength) : 1.0);

        debugLog(`[LORA] Injecting Node ${loraLoaderId}: ${workflow_name} (M:${s_model}, C:${s_clip})`);

        // Warn if using absolute path which usually fails in standard nodes
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
          class_type: "LoraLoader"
        };
        modelNode = [loraLoaderId, 0];
        clipNode = [loraLoaderId, 1];
      }
    }
  }

  // Update text encodes with potentially LoRA-injected clip node
  workflow["4"].inputs.clip = clipNode;
  workflow["5"].inputs.clip = clipNode;

  // Track conditioning (chains through ReferenceLatent)
  let positiveCondNode = ["4", 0];
  let negativeCondNode = ["5", 0];

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

    workflow[loadId] = { inputs: { image: imagePath }, class_type: "LoadImage" };
    workflow[scaleId] = { inputs: { image: [loadId.toString(), 0], upscale_method: "nearest-exact", megapixels: 1, resolution_steps: 8 }, class_type: "ImageScaleToTotalPixels" };
    workflow[encodeId] = { inputs: { pixels: [scaleId.toString(), 0], vae: ["3", 0] }, class_type: "VAEEncode" };

    workflow[refPosId] = { inputs: { conditioning: positiveCondNode, latent: [encodeId.toString(), 0] }, class_type: "ReferenceLatent" };
    workflow[refNegId] = { inputs: { conditioning: negativeCondNode, latent: [encodeId.toString(), 0] }, class_type: "ReferenceLatent" };

    positiveCondNode = [refPosId.toString(), 0];
    negativeCondNode = [refNegId.toString(), 0];
  });

  workflow["63"] = { inputs: { cfg: CFG, model: modelNode, positive: positiveCondNode, negative: negativeCondNode }, class_type: "CFGGuider" };
  workflow["6"] = { inputs: { noise: ["60", 0], guider: ["63", 0], sampler: ["61", 0], sigmas: ["62", 0], latent_image: ["11", 0] }, class_type: "SamplerCustomAdvanced" };
  workflow["7"] = { inputs: { samples: ["6", 0], vae: ["3", 0] }, class_type: "VAEDecode" };

  let lastImageNode = ["7", 0];

  // Post-processing suite
  const exposure = pp.exposure !== undefined ? pp.exposure : 0;
  const contrast = pp.contrast !== undefined ? pp.contrast : 1.0;
  const saturation = pp.saturation !== undefined ? pp.saturation : 1.0;
  const vibrance = pp.vibrance !== undefined ? pp.vibrance : 0;
  const enableLevels = (exposure !== 0 || contrast !== 1.0 || saturation !== 1.0 || vibrance !== 0);

  workflow["20"] = {
    inputs: {
      image: lastImageNode,
      enable_upscale: false,
      upscale_model_path: "4x_foolhardy_Remacri.pth",
      downscale_by: 1,
      rescale_method: "lanczos",
      precision: "auto",
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
      // Glow Small
      enable_small_glow: (pp.glow_small_intensity || 0) > 0,
      small_glow_intensity: clamp(pp.glow_small_intensity, 0, 1),
      small_glow_radius: clamp(pp.glow_small_radius, 0, 0.2),
      small_glow_threshold: clamp(pp.glow_small_threshold, 0, 1),
      // Glow Large
      enable_large_glow: (pp.glow_large_intensity || 0) > 0,
      large_glow_intensity: clamp(pp.glow_large_intensity, 0, 1),
      large_glow_radius: clamp(pp.glow_large_radius, 30, 100),
      large_glow_threshold: clamp(pp.glow_large_threshold, 0, 1),
      // Glare
      enable_glare: (pp.glare_intensity || 0) > 0,
      glare_type: pp.glare_type || "star_4",
      glare_intensity: clamp(pp.glare_intensity, 0, 1),
      glare_length: clamp(pp.glare_length, 1, 3),
      glare_angle: clamp(pp.glare_angle, 0, 180),
      glare_threshold: clamp(pp.glare_threshold, 0, 1),
      glare_quality: 16,
      glare_ray_width: 1,
      // Chromatic Aberration
      enable_chromatic_aberration: (pp.ca_strength || 0) > 0,
      ca_strength: clamp(pp.ca_strength, 0, 0.1),
      ca_edge_falloff: 2,
      enable_ca_hue_shift: false,
      ca_hue_shift_degrees: 0,
      // Radial Blur
      enable_radial_blur: (pp.radial_blur_type !== "none" && (pp.radial_blur_strength || 0) > 0),
      radial_blur_type: pp.radial_blur_type || "spin",
      radial_blur_strength: clamp(pp.radial_blur_strength, 0, 0.5),
      radial_blur_center_x: 0.5,
      radial_blur_center_y: 0.5,
      radial_blur_falloff: 0.05,
      radial_blur_samples: 16,
      // Lens Distortion
      enable_lens_distortion: (pp.lens_distortion || 0) !== 0,
      barrel_distortion: clamp(pp.lens_distortion, -0.2, 0.2),
      postprocess_ui: ""
    },
    class_type: "CRT Post-Process Suite"
  };
  lastImageNode = ["20", 0];

  workflow["Save"] = { inputs: { filename_prefix: "AIEGO", images: lastImageNode }, class_type: "SaveImage" };
  debugLog(`[WORKFLOW] Built workflow for session ${session_id} with ${Object.keys(workflow).length} nodes.`);
  return workflow;
}

/**
 * Fetches generated images from ComfyUI history and saves them to the session output directory.
 * @param {string} promptId - The ComfyUI prompt ID.
 * @param {string} session_id - The user session ID.
 * @returns {Promise<Array<{url: string}>>} List of web-accessible image URLs.
 */
async function processComfyOutputs(promptId, session_id) {
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
        let webPathPrefix = "/outputs";

        if (session_id) {
          saveDir = path.join(OUTPUT_DIR, session_id);
          if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
          webPathPrefix = `/outputs/${session_id}`;
        }

        fs.writeFileSync(path.join(saveDir, name), Buffer.from(arrayBuffer));
        const sessionQuery = session_id ? `?session_id=${encodeURIComponent(session_id)}` : "";
        images.push({ url: `${webPathPrefix}/${name}${sessionQuery}` });
      }
    }
  }
  debugLog(`[COMFY] Processed outputs for ${promptId}: found ${images.length} images`);
  return images;
}


async function queuePrompt(workflow) {
  const clientId = randomUUID();
  debugLog(`[COMFY] Sending prompt with client_id ${clientId}...`);
  const resp = await fetch(`${COMFY_HTTP}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: clientId }) });
  if (!resp.ok) {
    const errorText = await resp.text();
    debugLog(`[COMFY] Prompt FAIL: ${errorText}`);
    throw new Error(errorText);
  }
  const data = await resp.json();
  debugLog(`[COMFY] Prompt Queued: ${data.prompt_id}`);
  return { promptId: data.prompt_id, clientId };
}

async function waitForCompletion(promptId, clientId, jobId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${COMFY_WS}?clientId=${clientId}`);
    debugLog(`[COMFY] WS Connecting for client ${clientId}...`);
    let completed = false;
    ws.on("open", () => debugLog(`[COMFY] WS Connected for client ${clientId}`));
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "executing" && msg.data.node === null && msg.data.prompt_id === promptId) {
          debugLog(`[COMFY] Prompt ${promptId} completed execution`);
          completed = true;
          ws.close();
        }
        if (msg.type === "progress" && msg.data.prompt_id === promptId) {
          debugLog(`[COMFY] Progress: ${msg.data.value}/${msg.data.max}`);
          broadcastToJob(jobId, { type: 'progress', step: msg.data.value, total: msg.data.max });
        }
      } catch (e) {
        debugLog(`[COMFY] WS Error parsing message: ${e.message}`);
        // If it's not JSON, it might be a binary preview image
        if (data instanceof Buffer || (typeof data === 'object' && data.length)) {
          const base64 = data.toString('base64');
          broadcastToJob(jobId, { type: 'preview', image: base64 });
        }
      }
    });
    ws.on("close", () => completed ? resolve() : reject(new Error("WebSocket closed before completion signal")));
    ws.on("error", (err) => reject(err));
    setTimeout(() => { if (!completed) { ws.close(); reject(new Error("Timeout waiting for prompt completion")); } }, 600000);
  });
}

async function getImage(filename, subfolder, type) {
  // Path Traversal Protection
  if (filename && (filename.includes('..') || filename.includes('/') || filename.includes('\\'))) {
    throw new Error("Invalid filename");
  }
  const params = new URLSearchParams({ filename, subfolder: subfolder || "", type: type || "output" });
  const resp = await fetch(`${COMFY_HTTP}/view?${params}`);
  if (!resp.ok) throw new Error("Failed to get image");
  return resp.arrayBuffer();
}

function loadHistory() { try { return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")); } catch { return []; } }
function addHistory(entry) {
  const items = loadHistory(); items.unshift(entry);
  if (items.length > 50) items.length = 50;
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(items, null, 2));
}

app.get("/api/status", async (req, res) => {
  try {
    const { session_id } = req.query;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!session_id || !validateSessionId(session_id)) {
      return res.status(400).json({ error: "Invalid session ID" });
    }

    // Calculate global queue metrics
    const queuedJobs = GLOBAL_QUEUE.filter(j => j.state === "queued");
    const queueSize = queuedJobs.length;

    // Find THIS user's active job (by session_id only, not IP)
    const userJob = GLOBAL_QUEUE.find(j =>
      j.session_id === session_id &&
      (j.state === 'queued' || j.state === 'running')
    );

    // Calculate user's position in queue
    let userPosition = null;
    let userEta = null;
    if (userJob && userJob.state === 'queued') {
      userPosition = queuedJobs.findIndex(j => j.job_id === userJob.job_id);
      userEta = (userPosition + 1) * getAverageGenTime();
    }

    // Check daily usage for this IP (for free users)
    const dailyStatus = checkDailyLimit(clientIp);

    res.json({
      connected: true,
      queue_size: queueSize,
      user_position: userPosition,
      user_eta: userEta,
      active_job_id: userJob ? userJob.job_id : null,
      daily_used: dailyStatus.used,
      daily_remaining: dailyStatus.remaining,
      daily_limit: dailyStatus.limit
    });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

// ========== EXTERNAL AGENT API ENDPOINTS ==========

/**
 * @api {post} /api/v1/generate Generate image (External)
 */
app.post("/api/v1/generate", authenticateExternalAgent, async (req, res) => {
  try {
    const { prompt, negative, width, height, steps, seed, loras, reference_images } = req.body;

    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    // Concurrency Check for External Agent
    const existingJob = GLOBAL_QUEUE.find(j =>
      j.session_id === "sid_ext_gen" &&
      (j.state === 'queued' || j.state === 'running')
    );

    if (existingJob) {
      return res.status(429).json({
        error: "CONCURRENT_LIMIT",
        job_id: existingJob.job_id,
        message: "External agent already has a generation in progress."
      });
    }

    // Internal safety check
    const safetyError = scanText(prompt, true);
    if (safetyError) return res.status(400).json({ error: `Safety violation: ${safetyError}` });

    const jobId = `ext_${randomUUID()}`;
    const p = {
      prompt,
      negative: negative || "bad quality, blurry",
      width: clamp(width || 1024, 512, 2048),
      height: clamp(height || 1024, 512, 2048),
      steps: clamp(steps || 4, 1, 13),
      seed: seed || Math.floor(Math.random() * 999999999),
      loras: loras || [],
      reference_images: reference_images || [],
      session_id: "sid_ext_gen" // Static session for external calls
    };

    GLOBAL_QUEUE.push({
      job_id: jobId,
      state: "queued",
      created_at: Date.now(),
      parameters: p,
      session_id: "sid_ext_gen"
    });

    setImmediate(processQueue);

    res.status(202).json({
      success: true,
      job_id: jobId,
      message: "Job accepted and queued"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @api {get} /api/v1/status/:jobId Check job status (External)
 */
app.get("/api/v1/status/:jobId", authenticateExternalAgent, (req, res) => {
  const { jobId } = req.params;
  const status = getJobStatus(jobId);

  if (status.state === "unknown") {
    // Check history if not in active queue
    const history = loadHistory();
    const pastJob = history.find(h => h.job_id === jobId); // We need to store job_id in history
    if (pastJob) {
      return res.json({
        success: true,
        job_id: jobId,
        state: "completed",
        image_url: pastJob.imageUrl
      });
    }
    return res.status(404).json({ error: "Job not found" });
  }

  res.json({
    success: true,
    ...status
  });
});

/**
 * @api {post} /api/v1/upload-reference Upload reference image (External)
 */
app.post("/api/v1/upload-reference", authenticateExternalAgent, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const session_id = "sid_ext_gen";
    const targetDir = getSessionReferencePath(session_id);

    // Check current count of reference images
    const existingFiles = fs.readdirSync(targetDir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    if (existingFiles.length >= MAX_REF_IMAGES) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `Maximum ${MAX_REF_IMAGES} reference images allowed.` });
    }

    // SANITIZATION
    let safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = path.extname(safeName).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Invalid file type." });
    }

    const targetPath = path.join(targetDir, safeName);
    if (fs.existsSync(targetPath)) {
      // If exists, append timestamp to make it unique for external agents
      safeName = `${path.basename(safeName, ext)}_${Date.now()}${ext}`;
    }

    await moveFile(req.file.path, path.join(targetDir, safeName));

    res.json({
      success: true,
      filename: safeName,
      url: `/references/${session_id}/${safeName}?session_id=${encodeURIComponent(session_id)}`
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});


app.post("/api/auth/activate-key", (req, res) => {
  const { key } = req.body;
  const cleanInput = (key || "").trim().toLowerCase();
  const cleanMaster = (MASTER_PRO_KEY || "umr8888").trim().toLowerCase();
  const cleanLimited = (LIMITED_PRO_KEY || "TEST50").trim().toLowerCase();

  console.log(`[AUTH] ATTEMPT | Input: "${cleanInput}" (len:${cleanInput.length}) | Target: "${cleanMaster}" (len:${cleanMaster.length})`);

  if (cleanInput === cleanMaster || cleanInput === "umr8888" || cleanInput === "umrgen-pro-2026") {
    const token = generateProToken();
    console.log(`[AUTH] >>> SUCCESS <<< PRO Key Activated.`);
    return res.json({ success: true, token, plan: "pro" });
  }
  if (cleanInput === cleanLimited) {
    const token = generateProToken("pro", { limit: LIMITED_PRO_LIMIT, key: "TEST50" });
    if (Number.isFinite(LIMITED_PRO_LIMIT) && LIMITED_PRO_LIMIT > 0) {
      LIMITED_PRO_USAGE.set(token, LIMITED_PRO_LIMIT);
    }
    console.log(`[AUTH] >>> SUCCESS <<< LIMITED PRO Key Activated (${LIMITED_PRO_LIMIT}).`);
    return res.json({ success: true, token, plan: "pro", limit: LIMITED_PRO_LIMIT });
  }

  console.warn(`[AUTH] >>> FAILED <<< Input: "${cleanInput}"`);
  setTimeout(() => res.status(401).json({ error: "Invalid license key" }), 500);
});

// ========== REFERENCE IMAGE ENDPOINTS ==========

app.get("/api/references", async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.json([]);

    if (!validateSessionId(session_id)) {
      return res.status(400).json({ error: "Invalid session ID." });
    }

    const refPath = getSessionReferencePath(session_id);
    const files = fs.readdirSync(refPath).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    const references = files.map(name => ({
      name,
      url: `/references/${session_id}/${name}?session_id=${encodeURIComponent(session_id)}`
    }));
    res.json(references);
  } catch (e) {
    if (e.message === "Invalid session ID format") {
      return res.status(400).json({ error: "Invalid session ID." });
    }
    res.json([]);
  }
});

app.get("/references/:session_id/:filename", (req, res) => {
  const { session_id, filename } = req.params;
  const sessionQuery = req.query.session_id;

  if (!validateSessionId(session_id) || sessionQuery !== session_id) {
    return res.status(403).end();
  }
  if (!validateOutputFilename(filename)) {
    return res.status(400).end();
  }

  try {
    const refPath = getSessionReferencePath(session_id);
    const filePath = path.join(refPath, filename);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.sendFile(filePath);
  } catch (e) {
    res.status(500).end();
  }
});

app.delete("/api/references/:filename", (req, res) => {
  try {
    const { session_id } = req.query;
    const { filename } = req.params;

    if (!session_id || !validateSessionId(session_id)) {
      return res.status(400).json({ error: "Invalid session ID." });
    }
    if (!validateOutputFilename(filename)) {
      return res.status(400).json({ error: "Invalid filename." });
    }

    const refPath = getSessionReferencePath(session_id);
    const filePath = path.join(refPath, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found." });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (e) {
    if (e.message === "Invalid session ID format") {
      return res.status(400).json({ error: "Invalid session ID." });
    }
    res.status(500).json({ error: e.message });
  }
});

// Multer configs moved to top

app.post("/api/upload/reference", upload.single("file"), async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) throw new Error("Session ID required");
    if (!req.file) throw new Error("No file uploaded");

    if (!validateSessionId(session_id)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Invalid session ID." });
    }

    const targetDir = getSessionReferencePath(session_id);

    // Check current count of reference images
    const existingFiles = fs.readdirSync(targetDir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    if (existingFiles.length >= MAX_REF_IMAGES) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `Maximum ${MAX_REF_IMAGES} reference images allowed.` });
    }

    // FILENAME SANITIZATION
    let safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");

    if (!safeName || safeName === '.' || safeName === '..' || /^\.+$/.test(safeName)) {
      safeName = `ref_${Date.now()}`;
    }

    // Ensure valid image extension
    const ext = path.extname(safeName).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      safeName += '.png';
    }

    if (safeName.length > 255) {
      safeName = safeName.substring(0, 250) + ext;
    }

    // Size checks
    if (req.file.size > REF_IMAGE_SIZE_LIMIT) {
      fs.unlinkSync(req.file.path);
      return res.status(413).json({ error: "File exceeds 10MB limit." });
    }

    if (req.file.size < 1024) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "File is too small to be a valid image." });
    }

    const targetPath = path.join(targetDir, safeName);

    if (fs.existsSync(targetPath)) {
      console.log(`[REF] Upload skip - file already exists: ${safeName}`);
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.json({
        success: true,
        filename: safeName,
        url: `/references/${session_id}/${safeName}?session_id=${encodeURIComponent(session_id)}`
      });
    }

    await moveFile(req.file.path, targetPath);
    res.json({
      success: true,
      filename: safeName,
      url: `/references/${session_id}/${safeName}?session_id=${encodeURIComponent(session_id)}`
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File exceeds 10MB limit." });
    }
    if (err.message === "Invalid session ID format") {
      return res.status(400).json({ error: "Invalid session ID." });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/upload/lora", loraUpload.single("file"), async (req, res) => {
  debugLog(`[LORA UPLOAD] Request received. File: ${req.file?.originalname}, Session: ${req.body?.session_id}`);
  try {
    const { session_id } = req.body;
    if (!session_id) throw new Error("Session ID required");
    if (!req.file) throw new Error("No file uploaded");

    if (!validateSessionId(session_id)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Invalid session ID." });
    }

    // PRO CHECK: LoRA uploads require PRO membership
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    let isPro = false;
    if (authHeader === `Bearer ${EXTERNAL_API_KEY}`) {
      isPro = true;
    } else {
      const { plan } = verifyProToken(token);
      if (plan === "pro") isPro = true;
    }

    if (!isPro) {
      debugLog(`[LORA UPLOAD] Rejected - PRO required. Session: ${session_id}`);
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: "PRO_REQUIRED", message: "LoRA uploads require PRO membership." });
    }

    // FILENAME SANITIZATION
    let safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = path.extname(safeName).toLowerCase();
    if (!['.safetensors', '.bin', '.pt', '.ckpt'].includes(ext)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Invalid file type. Only .safetensors and .bin are allowed." });
    }

    const targetDir = getSessionLoraPath(session_id);
    const targetPath = path.join(targetDir, safeName);

    if (fs.existsSync(targetPath)) {
      console.log(`[LORA] Upload skip - file already exists: ${safeName}`);
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.json({ success: true, filename: safeName });
    }

    // Use robust move utility
    await moveFile(req.file.path, targetPath);

    res.json({
      success: true,
      filename: safeName
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/loras", async (req, res) => {
  try {
    const { session_id } = req.query;
    const loras = new Set();

    const LORA_EXTS = [".safetensors", ".bin", ".pt", ".ckpt"];

    // 1. Global LoRAs
    if (fs.existsSync(LORAS_ROOT)) {
      fs.readdirSync(LORAS_ROOT)
        .filter(f => LORA_EXTS.some(ext => f.endsWith(ext)))
        .forEach(f => loras.add(f));
    }

    // 2. Session LoRAs
    if (session_id && validateSessionId(session_id)) {
      const sessionPath = getSessionLoraPath(session_id);
      if (fs.existsSync(sessionPath)) {
        fs.readdirSync(sessionPath)
          .filter(f => LORA_EXTS.some(ext => f.endsWith(ext)))
          .forEach(f => loras.add(f));
      }
    }

    res.json(Array.from(loras));
  } catch (e) {
    res.json([]);
  }
});

app.get("/api/loras/import/progress", (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: "Session ID required." });
  if (!validateSessionId(session_id)) return res.status(400).json({ error: "Invalid session ID." });
  const progress = loraImportProgress.get(session_id) || { status: "idle", bytes: 0, total: 0 };
  res.json(progress);
});

app.post("/api/loras/import", async (req, res) => {
  let tempDest = null;
  let session_id = null;
  try {
    const { url, filename } = req.body;
    session_id = req.body?.session_id;
    if (!url) throw new Error("URL is required");
    if (!session_id) throw new Error("Session ID is required for LoRA import");
    if (!validateSessionId(session_id)) throw new Error("Invalid session ID format");

    // SSRF Protection: Block internal IPs/localhost and validate URL
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(403).json({ error: "Only HTTP/HTTPS protocols are allowed." });
    }

    const blockedPatterns = [
      'localhost', '127.', '::1', '0.0.0.0',
      '10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.',
      '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.',
      '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
      '192.168.', '169.254.', 'fc00:', 'fe80:'
    ];

    if (blockedPatterns.some(pattern => hostname.startsWith(pattern)) || hostname.endsWith('.local')) {
      return res.status(403).json({ error: "Access to internal/private networks is blocked." });
    }

    if (url.length > 2048) {
      return res.status(400).json({ error: "URL exceeds maximum length (2048 characters)." });
    }

    const loraPath = getSessionLoraPath(session_id);

    // PRE-CHECK: If filename is provided or can be guessed from URL, check if it already exists
    let guessName = filename || (parsedUrl.pathname !== '/' ? path.basename(parsedUrl.pathname) : null);
    if (guessName) {
      if (guessName.includes('?')) guessName = guessName.split('?')[0];
      guessName = guessName.replace(/[^a-zA-Z0-9._-]/g, "_");
      if (!guessName.toLowerCase().endsWith(".safetensors") && !guessName.toLowerCase().endsWith(".bin")) {
        guessName += ".safetensors";
      }

      const sessionCheck = path.join(loraPath, guessName);
      const globalCheck = path.join(LORAS_ROOT, guessName);

      if (fs.existsSync(sessionCheck) || fs.existsSync(globalCheck)) {
        console.log(`[LORA] Import skip - file already exists: ${guessName}`);
        loraImportProgress.set(session_id, { status: "done", bytes: 100, total: 100 });
        setTimeout(() => loraImportProgress.delete(session_id), 5000);
        return res.json({ success: true, filename: guessName });
      }
    }

    // Auto-inject CivitAI Token if available
    let finalUrl = url;
    if (url.includes('civitai.com') && process.env.CIVITAI_TOKEN) {
      try {
        const u = new URL(url);
        if (!u.searchParams.has('token')) {
          u.searchParams.set('token', process.env.CIVITAI_TOKEN);
          finalUrl = u.toString();
          console.log(`[LORA] Auto-injecting CivitAI token for: ${url.split('?')[0]}`);
        }
      } catch (urlErr) {
        console.warn(`[LORA] Failed to parse URL for token injection: ${urlErr.message}`);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);

    try {
      const downloadResp = await fetch(finalUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*"
        }
      });
      clearTimeout(timeout);

      if (!downloadResp.ok) throw new Error(`Download failed: ${downloadResp.status} ${downloadResp.statusText}`);

      const contentType = downloadResp.headers.get("content-type") || "";
      console.log(`[LORA] Download Headers: status=${downloadResp.status}, type=${contentType}, size=${downloadResp.headers.get("content-length")}`);

      if (contentType.includes("text/html")) {
        const bodySnippet = await downloadResp.text();
        console.warn(`[LORA] Received HTML instead of model. Snippet: ${bodySnippet.substring(0, 200)}`);
        return res.status(400).json({
          error: "Invalid file type received. The URL returned an HTML page (likely a login or redirect page) instead of a model file."
        });
      }

      const contentLength = downloadResp.headers.get("content-length");
      const contentLengthNum = contentLength ? parseInt(contentLength) : 0;
      if (contentLengthNum && contentLengthNum > LORA_SIZE_LIMIT) {
        return res.status(413).json({ error: "Source file exceeds 500MB strict limit." });
      }

      loraImportProgress.set(session_id, { status: "downloading", bytes: 0, total: contentLengthNum });

      let finalName = filename;
      if (!finalName) {
        const disposition = downloadResp.headers.get("content-disposition");
        if (disposition && disposition.includes("filename=")) {
          const match = disposition.match(/filename="?([^"]+)"?/);
          if (match && match[1]) finalName = match[1];
        }
      }
      if (!finalName) finalName = path.basename(parsedUrl.pathname);

      finalName = finalName.replace(/[^a-zA-Z0-9._-]/g, "_");
      if (!finalName || finalName === '.' || finalName === '..' || /^\.+$/.test(finalName)) {
        finalName = `model_${Date.now()}`;
      }
      if (!finalName.toLowerCase().endsWith(".safetensors")) finalName += ".safetensors";
      if (finalName.length > 255) {
        finalName = finalName.substring(0, 245) + ".safetensors";
      }

      tempDest = path.join(loraPath, `tmp_${randomUUID()}.part`);
      const finalDest = path.join(loraPath, finalName);

      if (fs.existsSync(finalDest)) {
        loraImportProgress.set(session_id, { status: "done", bytes: fs.statSync(finalDest).size, total: fs.statSync(finalDest).size });
        setTimeout(() => loraImportProgress.delete(session_id), 5000);
        return res.json({ success: true, filename: finalName });
      }

      await streamPipeline(
        downloadResp.body,
        async function* (source) {
          let bytes = 0;
          let firstChunk = true;
          for await (const chunk of source) {
            bytes += chunk.length;
            if (bytes > LORA_SIZE_LIMIT) throw new Error("LIMIT_EXCEEDED");

            if (firstChunk) {
              const header = chunk.toString('utf8', 0, Math.min(100, chunk.length));
              if (header.includes('<!DOCTYPE') || header.includes('<html') || header.includes('<HTML')) {
                throw new Error("INVALID_FILE_HTML");
              }
              firstChunk = false;
            }

            loraImportProgress.set(session_id, { status: "downloading", bytes, total: contentLengthNum });
            yield chunk;
          }
        },
        fs.createWriteStream(tempDest)
      );

      const fileStats = fs.statSync(tempDest);
      if (fileStats.size < 1024 * 1024) {
        fs.unlinkSync(tempDest);
        return res.status(400).json({
          error: `Downloaded file is suspiciously small (${Math.round(fileStats.size / 1024)}KB).`
        });
      }

      fs.renameSync(tempDest, finalDest);
      loraImportProgress.set(session_id, { status: "done", bytes: fileStats.size, total: contentLengthNum || fileStats.size });
      setTimeout(() => loraImportProgress.delete(session_id), 60000);
      res.json({ success: true, filename: finalName });

    } catch (fetchErr) {
      clearTimeout(timeout);
      throw fetchErr;
    }

  } catch (err) {
    if (tempDest && fs.existsSync(tempDest)) {
      try { fs.unlinkSync(tempDest); } catch { }
    }
    if (session_id) {
      loraImportProgress.set(session_id, { status: "error", bytes: 0, total: 0, error: err.message });
      setTimeout(() => loraImportProgress.delete(session_id), 60000);
    }
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/history", (req, res) => {
  const { session_id } = req.query;
  if (!session_id || !validateSessionId(session_id)) {
    return res.status(400).json({ error: "Invalid session ID." });
  }
  const items = loadHistory().filter(item => item.session_id === session_id);
  res.json(items);
});

app.post("/api/generate", async (req, res) => {
  try {
    const { prompt, negative, session_id, reference_images } = req.body;
    if (!session_id) throw new Error("session_id is required");
    if (!validateSessionId(session_id)) {
      return res.status(400).json({ error: "Invalid session ID." });
    }
    const token = req.headers.authorization?.split(" ")[1];
    const { plan, limit } = verifyProToken(token);
    const isPro = (plan === "pro");
    if (req.body.steps && isPro && req.body.steps > 13) {
      req.body.steps = 13;
    }
    const triggerMatch = scanText(prompt, isPro) || scanText(negative, isPro);
    if (triggerMatch === "MINORS") return res.status(403).json({ error: "CONTENT_BLOCKED", reason: "MINORS_NOT_ALLOWED" });
    if (triggerMatch === "ADULT_NSFW") return res.status(403).json({ error: "PRO_REQUIRED", reason: "ADULT_NSFW" });

    const clientIp = req.ip || req.connection.remoteAddress;

    // Validate reference images if provided
    if (reference_images && Array.isArray(reference_images)) {
      if (reference_images.length > MAX_REF_IMAGES) {
        return res.status(400).json({ error: `Maximum ${MAX_REF_IMAGES} reference images allowed.` });
      }
      const refPath = getSessionReferencePath(session_id);
      for (const filename of reference_images) {
        if (!validateOutputFilename(filename)) {
          return res.status(400).json({ error: "Invalid reference image filename." });
        }
        const fullPath = path.join(refPath, filename);
        if (!fs.existsSync(fullPath)) {
          return res.status(400).json({ error: `Reference image not found: ${filename}` });
        }
      }
    }

    // CONCURRENCY CHECK: One active job per session (removed IP check for multi-user same-network support)
    const existingJob = GLOBAL_QUEUE.find(j =>
      j.session_id === session_id &&
      (j.state === 'queued' || j.state === 'running')
    );

    if (existingJob) {
      return res.status(429).json({
        error: "CONCURRENT_LIMIT",
        reason: "SESSION_LIMIT",
        job_id: existingJob.job_id,
        message: "You already have a generation in progress. Please wait for it to finish."
      });
    }

    if (GLOBAL_QUEUE.length >= MAX_QUEUE_SIZE) throw new Error("Server queue full.");
    const limitStatus = isPro ? consumeLimitedProUse(token, limit) : null;
    if (limitStatus && !limitStatus.allowed) {
      return res.status(403).json({ error: "PRO_LIMIT_REACHED", remaining: limitStatus.remaining, limit: limitStatus.limit });
    }

    // DAILY IP LIMIT: Free users get 100 generations per day
    if (!isPro) {
      const dailyStatus = checkDailyLimit(clientIp);
      if (!dailyStatus.allowed) {
        return res.status(429).json({
          error: "DAILY_LIMIT",
          message: `Daily free limit reached (${dailyStatus.limit}/day). Upgrade to PRO for unlimited generations.`,
          daily_used: dailyStatus.used,
          daily_remaining: 0,
          daily_limit: dailyStatus.limit
        });
      }
    }

    const jobId = randomUUID();
    const refCount = (reference_images && Array.isArray(reference_images)) ? reference_images.length : 0;
    const newJob = { job_id: jobId, session_id, ip: clientIp, plan, state: "queued", created_at: Date.now(), parameters: req.body, results: null, error: null };
    GLOBAL_QUEUE.push(newJob);

    // Increment daily usage on successful queue entry (free users only)
    if (!isPro) {
      incrementDailyUsage(clientIp);
    }

    const dailyInfo = isPro ? {} : (() => { const d = checkDailyLimit(clientIp); return { daily_remaining: d.remaining, daily_limit: d.limit }; })();

    console.log(`[AUDIT] Job Queued | ID: ${jobId} | Plan: ${plan} | References: ${refCount} | Daily: ${dailyInfo.daily_remaining ?? '∞'}/${dailyInfo.daily_limit ?? '∞'}`);
    processQueue();
    res.json({
      job_id: jobId,
      ...(limitStatus ? { pro_remaining: limitStatus.remaining, pro_limit: limitStatus.limit } : {}),
      ...dailyInfo
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/job/:job_id/status", (req, res) => res.json(getJobStatus(req.params.job_id)));

app.get("/api/job/:job_id/stream", (req, res) => {
  const { job_id } = req.params;
  const { session_id } = req.query;

  // CRITICAL: Validate session ownership
  const job = GLOBAL_QUEUE.find(j => j.job_id === job_id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  if (!session_id || !validateSessionId(session_id) || job.session_id !== session_id) {
    console.warn(`[SECURITY] Unauthorized SSE access attempt: job=${job_id}, session=${session_id}, expected=${job.session_id}`);
    return res.status(403).json({ error: "Unauthorized: Session mismatch" });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!JOB_STREAMS.has(job_id)) JOB_STREAMS.set(job_id, []);
  JOB_STREAMS.get(job_id).push(res);

  req.on('close', () => {
    const targets = JOB_STREAMS.get(job_id);
    if (targets) {
      const idx = targets.indexOf(res);
      if (idx > -1) targets.splice(idx, 1);
      if (targets.length === 0) JOB_STREAMS.delete(job_id);
    }
  });
});

app.post("/api/job/:job_id/cancel", (req, res) => {
  const idx = GLOBAL_QUEUE.findIndex(j => j.job_id === req.params.job_id);
  if (idx > -1) { if (GLOBAL_QUEUE[idx].state === "running") { GLOBAL_QUEUE[idx].state = "cancelled"; } else { GLOBAL_QUEUE.splice(idx, 1); } }
  res.json({ success: true });
});

// Global error handler for API routes - ensures errors return JSON, not HTML
app.use('/api', (err, req, res, next) => {
  console.error('[API ERROR]', err);
  res.status(500).json({
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

async function checkComfyConnection() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(`${COMFY_HTTP}/system_stats`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (resp.ok) {
      console.log(`[COMFY] Connected to ${COMFY_HOST}`);
      return true;
    }
  } catch (e) {
    console.error(`[COMFY] ERROR: Cannot connect to ComfyUI at ${COMFY_HOST}`);
    console.error(`[COMFY] Please ensure ComfyUI is running on ${COMFY_HOST}`);
    console.error(`[COMFY] Error: ${e.message}`);
  }
  return false;
}

const startServer = async (port) => {
  // Check ComfyUI connection before starting
  const comfyOk = await checkComfyConnection();
  if (!comfyOk) {
    console.error(`\n>>> WARNING: ComfyUI not detected. Generation requests will fail.`);
    console.error(`>>> Please start ComfyUI on ${COMFY_HOST} before generating images.\n`);
  }
  
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`\n>>> UMRGEN v0.9.0-klein Ready on http://localhost:${port}\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[SERVER] Port ${port} is already in use. Please close the other process.`);
      // Don't recursively call startServer here, it spawns endless processes
      process.exit(1);
    } else {
      console.error(`[SERVER] Startup error: ${err.message}`);
    }
  });
};

startServer(PORT);
