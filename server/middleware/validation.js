import fs from 'node:fs';
import path from 'node:path';
import { validateSessionId, validateOutputFilename, getSessionReferencePath } from '../services/file-utils.js';
import { MAX_REF_IMAGES } from '../config/constants.js';

export function requireSessionId(req, res, next) {
  const { session_id } = req.body || req.query;
  
  if (!session_id) {
    return res.status(400).json({ error: 'Session ID is required' });
  }
  
  if (!validateSessionId(session_id)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }
  
  next();
}

export function requireValidFilename(req, res, next) {
  const { filename } = req.params;
  
  if (!validateOutputFilename(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  
  next();
}

export function validateReferenceImages(req, res, next) {
  const { reference_images, session_id } = req.body;
  
  if (reference_images && Array.isArray(reference_images)) {
    if (reference_images.length > MAX_REF_IMAGES) {
      return res.status(400).json({ 
        error: `Maximum ${MAX_REF_IMAGES} reference images allowed.` 
      });
    }
    
    const refPath = getSessionReferencePath(session_id);
    
    for (const filename of reference_images) {
      if (!validateOutputFilename(filename)) {
        return res.status(400).json({ error: 'Invalid reference image filename.' });
      }
      const fullPath = path.join(refPath, filename);
      if (!fs.existsSync(fullPath)) {
        return res.status(400).json({ error: `Reference image not found: ${filename}` });
      }
    }
  }
  
  next();
}
