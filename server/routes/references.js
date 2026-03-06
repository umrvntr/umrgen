import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { REF_IMAGE_SIZE_LIMIT, MAX_REF_IMAGES, IMAGE_EXTS, TMP_UPLOADS } from '../config/constants.js';
import { validateSessionId, validateOutputFilename, getSessionReferencePath, moveFile } from '../services/file-utils.js';

const router = Router();

const upload = multer({
  dest: TMP_UPLOADS,
  limits: { fileSize: REF_IMAGE_SIZE_LIMIT }
});

router.get('/', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.json([]);

    if (!validateSessionId(session_id)) {
      return res.status(400).json({ error: 'Invalid session ID.' });
    }

    const refPath = getSessionReferencePath(session_id);
    const files = fs.readdirSync(refPath).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    const references = files.map(name => ({
      name,
      url: `/references/${session_id}/${name}?session_id=${encodeURIComponent(session_id)}`
    }));
    res.json(references);
  } catch (e) {
    res.json([]);
  }
});

router.get('/:session_id/:filename', (req, res) => {
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

router.post('/upload/reference', upload.single('file'), async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) throw new Error('Session ID required');
    if (!req.file) throw new Error('No file uploaded');

    if (!validateSessionId(session_id)) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid session ID.' });
    }

    const targetDir = getSessionReferencePath(session_id);

    const existingFiles = fs.readdirSync(targetDir).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
    if (existingFiles.length >= MAX_REF_IMAGES) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `Maximum ${MAX_REF_IMAGES} reference images allowed.` });
    }

    let safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');

    if (!safeName || safeName === '.' || safeName === '..') {
      safeName = `ref_${Date.now()}`;
    }

    const ext = path.extname(safeName).toLowerCase();
    if (!IMAGE_EXTS.includes(ext)) {
      safeName += '.png';
    }

    if (safeName.length > 255) {
      safeName = safeName.substring(0, 250) + ext;
    }

    if (req.file.size < 1024) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'File is too small to be a valid image.' });
    }

    const targetPath = path.join(targetDir, safeName);

    if (fs.existsSync(targetPath)) {
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
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File exceeds 10MB limit.' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:filename', (req, res) => {
  try {
    const { session_id } = req.query;
    const { filename } = req.params;

    if (!session_id || !validateSessionId(session_id)) {
      return res.status(400).json({ error: 'Invalid session ID.' });
    }
    if (!validateOutputFilename(filename)) {
      return res.status(400).json({ error: 'Invalid filename.' });
    }

    const refPath = getSessionReferencePath(session_id);
    const filePath = path.join(refPath, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found.' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
