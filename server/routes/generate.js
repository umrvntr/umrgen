import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { MAX_QUEUE_SIZE } from '../config/constants.js';
import { validateSessionId, scanText, getSessionReferencePath, debugLog } from '../services/file-utils.js';
import { GLOBAL_QUEUE, checkDailyLimit, incrementDailyUsage, JOB_STREAMS, COMPLETED_TIMES, broadcastToJob, getJobStatus, getAverageGenTime, processQueue } from '../services/queue.js';
import { verifyProToken, consumeLimitedProUse } from '../services/comfyui.js';
import { rateLimit } from '../middleware/auth.js';

const router = Router();

router.post('/generate', rateLimit, async (req, res) => {
  try {
    const { prompt, negative, session_id, reference_images } = req.body;
    if (!session_id) throw new Error('session_id is required');
    if (!validateSessionId(session_id)) {
      return res.status(400).json({ error: 'Invalid session ID.' });
    }
    
    const token = req.headers.authorization?.split(' ')[1];
    const { plan, limit } = verifyProToken(token);
    const isPro = (plan === 'pro');
    
    if (req.body.steps && isPro && req.body.steps > 13) {
      req.body.steps = 13;
    }
    
    const triggerMatch = scanText(prompt, isPro) || scanText(negative, isPro);
    if (triggerMatch === 'MINORS') return res.status(403).json({ error: 'CONTENT_BLOCKED', reason: 'MINORS_NOT_ALLOWED' });
    if (triggerMatch === 'ADULT_NSFW') return res.status(403).json({ error: 'PRO_REQUIRED', reason: 'ADULT_NSFW' });

    const clientIp = req.ip || req.connection.remoteAddress;

    const existingJob = GLOBAL_QUEUE.find(j =>
      j.session_id === session_id &&
      (j.state === 'queued' || j.state === 'running')
    );

    if (existingJob) {
      return res.status(429).json({
        error: 'CONCURRENT_LIMIT',
        reason: 'SESSION_LIMIT',
        job_id: existingJob.job_id,
        message: 'You already have a generation in progress.'
      });
    }

    if (GLOBAL_QUEUE.length >= MAX_QUEUE_SIZE) throw new Error('Server queue full.');
    
    const limitStatus = isPro ? consumeLimitedProUse(token, limit) : null;
    if (limitStatus && !limitStatus.allowed) {
      return res.status(403).json({ error: 'PRO_LIMIT_REACHED', remaining: limitStatus.remaining, limit: limitStatus.limit });
    }

    if (!isPro) {
      const dailyStatus = checkDailyLimit(clientIp);
      if (!dailyStatus.allowed) {
        return res.status(429).json({
          error: 'DAILY_LIMIT',
          message: `Daily free limit reached (${dailyStatus.limit}/day).`,
          daily_used: dailyStatus.used,
          daily_remaining: 0,
          daily_limit: dailyStatus.limit
        });
      }
    }

    const jobId = randomUUID();
    const newJob = { 
      job_id: jobId, 
      session_id, 
      ip: clientIp, 
      plan, 
      state: 'queued', 
      created_at: Date.now(), 
      parameters: req.body, 
      results: null, 
      error: null 
    };
    GLOBAL_QUEUE.push(newJob);

    if (!isPro) {
      incrementDailyUsage(clientIp);
    }

    const dailyInfo = isPro ? {} : (() => { 
      const d = checkDailyLimit(clientIp); 
      return { daily_remaining: d.remaining, daily_limit: d.limit }; 
    })();

    console.log(`[AUDIT] Job Queued | ID: ${jobId} | Plan: ${plan}`);
    
    setImmediate(processQueue);
    
    res.json({
      job_id: jobId,
      ...(limitStatus ? { pro_remaining: limitStatus.remaining, pro_limit: limitStatus.limit } : {}),
      ...dailyInfo
    });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

router.get('/job/:job_id/status', (req, res) => {
  res.json(getJobStatus(req.params.job_id));
});

router.get('/job/:job_id/stream', (req, res) => {
  const { job_id } = req.params;
  const { session_id } = req.query;

  const job = GLOBAL_QUEUE.find(j => j.job_id === job_id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (!session_id || !validateSessionId(session_id) || job.session_id !== session_id) {
    return res.status(403).json({ error: 'Unauthorized: Session mismatch' });
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

router.post('/job/:job_id/cancel', (req, res) => {
  const idx = GLOBAL_QUEUE.findIndex(j => j.job_id === req.params.job_id);
  if (idx > -1) {
    if (GLOBAL_QUEUE[idx].state === 'running') {
      GLOBAL_QUEUE[idx].state = 'cancelled';
    } else {
      GLOBAL_QUEUE.splice(idx, 1);
    }
  }
  res.json({ success: true });
});

router.get('/status', (req, res) => {
  const { session_id } = req.query;
  const clientIp = req.ip || req.connection.remoteAddress;

  if (!session_id || !validateSessionId(session_id)) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const queuedJobs = GLOBAL_QUEUE.filter(j => j.state === 'queued');
  const queueSize = queuedJobs.length;

  const userJob = GLOBAL_QUEUE.find(j =>
    j.session_id === session_id &&
    (j.state === 'queued' || j.state === 'running')
  );

  let userPosition = null;
  let userEta = null;
  if (userJob && userJob.state === 'queued') {
    userPosition = queuedJobs.findIndex(j => j.job_id === userJob.job_id);
    userEta = (userPosition + 1) * getAverageGenTime();
  }

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
});

export default router;
