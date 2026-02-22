import path from 'node:path';
import fs from 'node:fs';

export const PORT = process.env.PORT || 3088;
export const COMFY_HOST = process.env.COMFY_HOST || '127.0.0.1:8188';
export const COMFY_HTTP = `http://${COMFY_HOST}`;
export const COMFY_WS = `ws://${COMFY_HOST}/ws`;

export const OUTPUT_DIR = path.join(process.cwd(), 'outputs');
export const HISTORY_PATH = path.join(process.cwd(), 'history.json');
export const SESSIONS_ROOT = path.join(process.cwd(), 'sessions');
export const LORAS_ROOT = process.env.LORAS_ROOT || path.join(process.cwd(), 'USER_LORA');
export const TMP_UPLOADS = path.join(process.cwd(), 'tmp_uploads');

export const LORA_SIZE_LIMIT = 2048 * 1024 * 1024;
export const REF_IMAGE_SIZE_LIMIT = 10 * 1024 * 1024;
export const MAX_REF_IMAGES = 10;
export const MAX_QUEUE_SIZE = 500;

export const RATE_LIMIT_WINDOW = 60 * 1000;
export const MAX_REQUESTS_PER_WINDOW = 60;

export const SESSION_TTL = 8 * 60 * 60 * 1000;
export const FREE_DAILY_LIMIT = 100;

export const PRO_SECRET = process.env.PRO_SECRET || 'umrgen-pro-secure-v8';
export const MASTER_PRO_KEY = (process.env.MASTER_PRO_KEY || 'umr8888').trim();
export const LIMITED_PRO_KEY = (process.env.TEST50 || 'TEST50').trim();
export const LIMITED_PRO_LIMIT = parseInt(process.env.TEST50_LIMIT || '50', 10);

export const EXTERNAL_API_KEY = (process.env.EXTERNAL_API_KEY || 'z-img-secret-key-2026').trim();

export const TRIGGER_CONFIG = {
  MINORS: {
    blocked_always: true,
    patterns: ['loli', 'lolita', 'child', 'children', 'underage', 'minor', 'kid', 'preteen', 'pedo', 'cp']
  },
  ADULT_NSFW: {
    blocked_in_free: true,
    patterns: ['naked', 'nude', 'nudity', 'nipples', 'bare breasts', 'pussy', 'dick', 'penis', 'vagina', 'anus', 'tits', 'intercourse', 'blowjob', 'genitals', 'sex act', 'explicit sexual', 'porn', 'explicit', 'xxx', 'hardcore']
  }
};

export const LORA_EXTS = ['.safetensors', '.bin', '.pt', '.ckpt'];
export const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

export function ensureDirectories() {
  const dirs = [OUTPUT_DIR, SESSIONS_ROOT, LORAS_ROOT, TMP_UPLOADS];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirectories();
