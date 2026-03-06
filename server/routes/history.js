import fs from 'node:fs';
import { Router } from 'express';
import { HISTORY_PATH } from '../config/constants.js';
import { validateSessionId } from '../services/file-utils.js';

const router = Router();

export function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return [];
  }
}

export function addHistory(entry) {
  const items = loadHistory();
  items.unshift(entry);
  if (items.length > 50) items.length = 50;
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(items, null, 2));
}

router.get('/history', (req, res) => {
  const { session_id } = req.query;
  if (!session_id || !validateSessionId(session_id)) {
    return res.status(400).json({ error: 'Invalid session ID.' });
  }
  const items = loadHistory().filter(item => item.session_id === session_id);
  res.json(items);
});

export default router;
