import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import fetch from 'node-fetch';
import multer from 'multer';
import { LORAS_ROOT, LORA_SIZE_LIMIT, LORA_EXTS, TMP_UPLOADS } from '../config/constants.js';
import { validateSessionId, getSessionLoraPath } from '../services/file-utils.js';
import { loraImportProgress } from '../services/queue.js';
import { checkProStatus } from '../middleware/auth.js';

const router = Router();

const loraUpload = multer({
  dest: TMP_UPLOADS,
  limits: { fileSize: LORA_SIZE_LIMIT }
});

router.get('/loras', async (req, res) => {
  try {
    const { session_id } = req.query;
    const loras = new Set();

    if (fs.existsSync(LORAS_ROOT)) {
      fs.readdirSync(LORAS_ROOT)
        .filter(f => LORA_EXTS.some(ext => f.endsWith(ext)))
        .forEach(f => loras.add(f));
    }

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

router.get('/loras/import/progress', (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Session ID required.' });
  if (!validateSessionId(session_id)) return res.status(400).json({ error: 'Invalid session ID.' });
  const progress = loraImportProgress.get(session_id) || { status: 'idle', bytes: 0, total: 0 };
  res.json(progress);
});

router.post('/loras/import', async (req, res) => {
  let tempDest = null;
  let session_id = null;
  
  try {
    const { url, filename } = req.body;
    session_id = req.body?.session_id;
    if (!url) throw new Error('URL is required');
    if (!session_id) throw new Error('Session ID is required for LoRA import');
    if (!validateSessionId(session_id)) throw new Error('Invalid session ID format');

    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(403).json({ error: 'Only HTTP/HTTPS protocols are allowed.' });
    }

    const blockedPatterns = [
      'localhost', '127.', '::1', '0.0.0.0',
      '10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.',
      '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.',
      '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
      '192.168.', '169.254.', 'fc00:', 'fe80:'
    ];

    if (blockedPatterns.some(pattern => hostname.startsWith(pattern)) || hostname.endsWith('.local')) {
      return res.status(403).json({ error: 'Access to internal/private networks is blocked.' });
    }

    if (url.length > 2048) {
      return res.status(400).json({ error: 'URL exceeds maximum length.' });
    }

    const loraPath = getSessionLoraPath(session_id);

    let guessName = filename || (parsedUrl.pathname !== '/' ? path.basename(parsedUrl.pathname) : null);
    if (guessName) {
      if (guessName.includes('?')) guessName = guessName.split('?')[0];
      guessName = guessName.replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!guessName.toLowerCase().endsWith('.safetensors') && !guessName.toLowerCase().endsWith('.bin')) {
        guessName += '.safetensors';
      }

      const sessionCheck = path.join(loraPath, guessName);
      const globalCheck = path.join(LORAS_ROOT, guessName);

      if (fs.existsSync(sessionCheck) || fs.existsSync(globalCheck)) {
        loraImportProgress.set(session_id, { status: 'done', bytes: 100, total: 100 });
        setTimeout(() => loraImportProgress.delete(session_id), 5000);
        return res.json({ success: true, filename: guessName });
      }
    }

    let finalUrl = url;
    if (url.includes('civitai.com') && process.env.CIVITAI_TOKEN) {
      try {
        const u = new URL(url);
        if (!u.searchParams.has('token')) {
          u.searchParams.set('token', process.env.CIVITAI_TOKEN);
          finalUrl = u.toString();
        }
      } catch (urlErr) { }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);

    const downloadResp = await fetch(finalUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        'Accept': '*/*'
      }
    });
    clearTimeout(timeout);

    if (!downloadResp.ok) throw new Error(`Download failed: ${downloadResp.status}`);

    const contentType = downloadResp.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return res.status(400).json({ error: 'Invalid file type received.' });
    }

    const contentLength = downloadResp.headers.get('content-length');
    const contentLengthNum = contentLength ? parseInt(contentLength) : 0;
    if (contentLengthNum && contentLengthNum > LORA_SIZE_LIMIT) {
      return res.status(413).json({ error: 'Source file exceeds limit.' });
    }

    loraImportProgress.set(session_id, { status: 'downloading', bytes: 0, total: contentLengthNum });

    let finalName = filename;
    if (!finalName) {
      const disposition = downloadResp.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) finalName = match[1];
      }
    }
    if (!finalName) finalName = path.basename(parsedUrl.pathname);

    finalName = finalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!finalName || finalName === '.' || finalName === '..') {
      finalName = `model_${Date.now()}`;
    }
    if (!finalName.toLowerCase().endsWith('.safetensors')) finalName += '.safetensors';

    tempDest = path.join(loraPath, `tmp_${randomUUID()}.part`);
    const finalDest = path.join(loraPath, finalName);

    if (fs.existsSync(finalDest)) {
      loraImportProgress.set(session_id, { status: 'done', bytes: fs.statSync(finalDest).size, total: fs.statSync(finalDest).size });
      setTimeout(() => loraImportProgress.delete(session_id), 5000);
      return res.json({ success: true, filename: finalName });
    }

    await pipeline(
      downloadResp.body,
      async function* (source) {
        let bytes = 0;
        let firstChunk = true;
        for await (const chunk of source) {
          bytes += chunk.length;
          if (bytes > LORA_SIZE_LIMIT) throw new Error('LIMIT_EXCEEDED');
          if (firstChunk) {
            const header = chunk.toString('utf8', 0, Math.min(100, chunk.length));
            if (header.includes('<!DOCTYPE') || header.includes('<html')) {
              throw new Error('INVALID_FILE_HTML');
            }
            firstChunk = false;
          }
          loraImportProgress.set(session_id, { status: 'downloading', bytes, total: contentLengthNum });
          yield chunk;
        }
      },
      fs.createWriteStream(tempDest)
    );

    const fileStats = fs.statSync(tempDest);
    if (fileStats.size < 1024 * 1024) {
      fs.unlinkSync(tempDest);
      return res.status(400).json({ error: 'Downloaded file is too small.' });
    }

    fs.renameSync(tempDest, finalDest);
    loraImportProgress.set(session_id, { status: 'done', bytes: fileStats.size, total: contentLengthNum || fileStats.size });
    setTimeout(() => loraImportProgress.delete(session_id), 60000);
    res.json({ success: true, filename: finalName });

  } catch (err) {
    if (tempDest && fs.existsSync(tempDest)) try { fs.unlinkSync(tempDest); } catch { }
    if (session_id) {
      loraImportProgress.set(session_id, { status: 'error', bytes: 0, total: 0, error: err.message });
      setTimeout(() => loraImportProgress.delete(session_id), 60000);
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload/lora', loraUpload.single('file'), async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) throw new Error('Session ID required');
    if (!req.file) throw new Error('No file uploaded');

    if (!validateSessionId(session_id)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid session ID.' });
    }

    const { isPro } = checkProStatus(req);
    if (!isPro) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'PRO_REQUIRED', message: 'LoRA uploads require PRO membership.' });
    }

    let safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(safeName).toLowerCase();
    if (!['.safetensors', '.bin', '.pt', '.ckpt'].includes(ext)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid file type.' });
    }

    const targetDir = getSessionLoraPath(session_id);
    const targetPath = path.join(targetDir, safeName);

    if (fs.existsSync(targetPath)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.json({ success: true, filename: safeName });
    }

    fs.renameSync(req.file.path, targetPath);
    res.json({ success: true, filename: safeName });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

export default router;
