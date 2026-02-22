import { MAX_QUEUE_SIZE, FREE_DAILY_LIMIT } from '../config/constants.js';
import { debugLog, getSessionReferencePath } from './file-utils.js';
import path from 'node:path';
import fs from 'node:fs';

export const GLOBAL_QUEUE = [];
export const COMPLETED_TIMES = [];
export const JOB_STREAMS = new Map();
export const LIMITED_PRO_USAGE = new Map();
export const LIMITED_KEY_ACTIVATIONS = new Map();
export const dailyIpUsage = new Map();
export const loraImportProgress = new Map();
export const rateLimitMap = new Map();

export function getAverageGenTime() {
  if (COMPLETED_TIMES.length === 0) return 30;
  const sum = COMPLETED_TIMES.reduce((a, b) => a + b, 0);
  return Math.round(sum / COMPLETED_TIMES.length);
}

export function broadcastToJob(jobId, data) {
  const targets = JOB_STREAMS.get(jobId);
  if (targets) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    targets.forEach(res => res.write(payload));
  }
}

export function getJobStatus(jobId) {
  const job = GLOBAL_QUEUE.find(j => j.job_id === jobId);
  if (!job) return { state: 'unknown' };
  const queuedJobs = GLOBAL_QUEUE.filter(j => j.state === 'queued');
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

export function getDailyUsage(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = dailyIpUsage.get(ip);
  if (!entry || entry.date !== today) {
    dailyIpUsage.set(ip, { count: 0, date: today });
    return { count: 0, date: today };
  }
  return entry;
}

export function incrementDailyUsage(ip) {
  const usage = getDailyUsage(ip);
  usage.count += 1;
  dailyIpUsage.set(ip, usage);
  return usage;
}

export function checkDailyLimit(ip) {
  const usage = getDailyUsage(ip);
  return {
    allowed: usage.count < FREE_DAILY_LIMIT,
    used: usage.count,
    remaining: Math.max(0, FREE_DAILY_LIMIT - usage.count),
    limit: FREE_DAILY_LIMIT
  };
}

export function cleanupDailyUsage() {
  const today = new Date().toISOString().slice(0, 10);
  for (const [ip, entry] of dailyIpUsage) {
    if (entry.date !== today) dailyIpUsage.delete(ip);
  }
}

export function cleanupRateLimit() {
  const now = Date.now();
  const cutoff = now - (60 * 1000 * 2);
  for (const [key] of rateLimitMap) {
    const timestamp = parseInt(key.split(':')[1]) * 60 * 1000;
    if (timestamp < cutoff) rateLimitMap.delete(key);
  }
}

let processQueueRunning = false;

export async function processQueue() {
  if (processQueueRunning) return;
  
  const activeJob = GLOBAL_QUEUE.find(j => j.state === 'running');
  if (activeJob) return;
  
  const nextJob = GLOBAL_QUEUE.find(j => j.state === 'queued');
  if (!nextJob) return;
  
  processQueueRunning = true;
  nextJob.state = 'running';
  nextJob.started_at = Date.now();
  debugLog(`[QUEUE] Processing Job ${nextJob.job_id} for session ${nextJob.session_id}`);
  
  try {
    const { queuePrompt, waitForCompletion, processComfyOutputs } = await import('./comfyui.js');
    const { buildWorkflowKlein } = await import('./workflow.js');
    const { addHistory } = await import('../routes/history.js');
    
    const p = nextJob.parameters;

    let referenceImages = [];
    if (p.session_id && p.reference_images && Array.isArray(p.reference_images)) {
      const refPath = getSessionReferencePath(p.session_id);
      for (const filename of p.reference_images) {
        if (!filename || typeof filename !== 'string') continue;
        const fullPath = path.join(refPath, filename);
        if (fs.existsSync(fullPath)) {
          referenceImages.push(fullPath);
        }
      }
    }

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
    nextJob.state = 'completed';
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
    
    console.log(`[QUEUE] Job ${nextJob.job_id} completed in ${duration.toFixed(1)}s`);
  } catch (err) {
    debugLog(`[QUEUE] Job ${nextJob.job_id} FAILED: ${err.message}`);
    nextJob.state = 'failed';
    nextJob.error = err.message;
    broadcastToJob(nextJob.job_id, { type: 'error', message: err.message });
  } finally {
    processQueueRunning = false;
    
    setTimeout(() => {
      const idx = GLOBAL_QUEUE.findIndex(j => j.job_id === nextJob.job_id);
      if (idx > -1) GLOBAL_QUEUE.splice(idx, 1);
    }, 60000);
    
    setImmediate(processQueue);
  }
}
