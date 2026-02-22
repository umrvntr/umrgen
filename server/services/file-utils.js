import fs from 'node:fs';
import path from 'node:path';
import { SESSIONS_ROOT, LORAS_ROOT, SESSION_TTL, TRIGGER_CONFIG } from '../config/constants.js';

export function debugLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  fs.appendFileSync(path.join(process.cwd(), 'debug.log'), line);
}

export async function moveFile(src, dest) {
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

export function validateSessionId(session_id) {
  if (!session_id || typeof session_id !== 'string') return false;
  if (!/^sid_[a-z0-9_-]{5,50}$/i.test(session_id)) return false;
  if (session_id.includes('..') || session_id.includes('/') || session_id.includes('\\')) return false;
  return true;
}

export function validateOutputFilename(filename) {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false;
  return /^[a-zA-Z0-9._-]+$/.test(filename);
}

export function getSessionReferencePath(session_id) {
  if (!validateSessionId(session_id)) {
    throw new Error('Invalid session ID format');
  }
  const p = path.join(SESSIONS_ROOT, session_id, 'references');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

export function getSessionLoraPath(session_id) {
  if (!validateSessionId(session_id)) {
    throw new Error('Invalid session ID format');
  }
  const p = path.join(SESSIONS_ROOT, session_id, 'loras');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

export function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scanText(text, isPro = false) {
  const norm = normalizeText(text);
  if (!norm) return null;
  
  for (const p of TRIGGER_CONFIG.MINORS.patterns) {
    if (norm.includes(p)) return 'MINORS';
  }
  if (!isPro) {
    for (const p of TRIGGER_CONFIG.ADULT_NSFW.patterns) {
      if (norm.includes(p)) return 'ADULT_NSFW';
    }
  }
  return null;
}

export function cleanupSessions() {
  try {
    const sessions = fs.readdirSync(SESSIONS_ROOT);
    const now = Date.now();
    
    for (const sid of sessions) {
      const fullPath = path.join(SESSIONS_ROOT, sid);
      const stats = fs.statSync(fullPath);

      if (sid === 'sid_ext_gen') continue;

      if (now - stats.mtimeMs > SESSION_TTL) {
        console.log(`[CLEANUP] Removing expired session: ${sid}`);

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
