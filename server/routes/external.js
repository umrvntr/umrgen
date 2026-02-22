import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { authenticateExternalAgent } from '../middleware/auth.js';
import { GLOBAL_QUEUE, getJobStatus, processQueue } from '../services/queue.js';
import { scanText } from '../services/file-utils.js';
import { loadHistory } from './history.js';

const router = Router();

const clamp = (val, min, max) => Math.min(Math.max(parseFloat(val) || 0, min), max);

router.post('/generate', authenticateExternalAgent, async (req, res) => {
  try {
    const { prompt, negative, width, height, steps, seed, loras, reference_images } = req.body;

    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const existingJob = GLOBAL_QUEUE.find(j =>
      j.session_id === 'sid_ext_gen' &&
      (j.state === 'queued' || j.state === 'running')
    );

    if (existingJob) {
      return res.status(429).json({
        error: 'CONCURRENT_LIMIT',
        job_id: existingJob.job_id,
        message: 'External agent already has a generation in progress.'
      });
    }

    const safetyError = scanText(prompt, true);
    if (safetyError) return res.status(400).json({ error: `Safety violation: ${safetyError}` });

    const jobId = `ext_${randomUUID()}`;
    const p = {
      prompt,
      negative: negative || 'bad quality, blurry',
      width: clamp(width || 1024, 512, 2048),
      height: clamp(height || 1024, 512, 2048),
      steps: clamp(steps || 4, 1, 13),
      seed: seed || Math.floor(Math.random() * 999999999),
      loras: loras || [],
      reference_images: reference_images || [],
      session_id: 'sid_ext_gen'
    };

    GLOBAL_QUEUE.push({
      job_id: jobId,
      state: 'queued',
      created_at: Date.now(),
      parameters: p,
      session_id: 'sid_ext_gen'
    });

    setImmediate(processQueue);

    res.status(202).json({
      success: true,
      job_id: jobId,
      message: 'Job accepted and queued'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status/:jobId', authenticateExternalAgent, (req, res) => {
  const { jobId } = req.params;
  const status = getJobStatus(jobId);

  if (status.state === 'unknown') {
    const history = loadHistory();
    const pastJob = history.find(h => h.job_id === jobId);
    if (pastJob) {
      return res.json({
        success: true,
        job_id: jobId,
        state: 'completed',
        image_url: pastJob.imageUrl
      });
    }
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    success: true,
    ...status
  });
});

export default router;
