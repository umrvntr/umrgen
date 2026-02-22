import { MAX_QUEUE_SIZE, FREE_DAILY_LIMIT } from '../config/constants.js';
import { debugLog } from './file-utils.js';

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
