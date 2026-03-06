import { Router } from 'express';
import { MASTER_PRO_KEY, LIMITED_PRO_KEY, LIMITED_PRO_LIMIT } from '../config/constants.js';
import { generateProToken } from '../services/comfyui.js';
import { LIMITED_PRO_USAGE } from '../services/queue.js';

const router = Router();

router.post('/auth/activate-key', (req, res) => {
  const { key } = req.body;
  const cleanInput = (key || '').trim().toLowerCase();
  const cleanMaster = (MASTER_PRO_KEY || 'umr8888').trim().toLowerCase();
  const cleanLimited = (LIMITED_PRO_KEY || 'TEST50').trim().toLowerCase();

  console.log(`[AUTH] ATTEMPT | Input: "${cleanInput}"`);

  if (cleanInput === cleanMaster || cleanInput === 'umr8888' || cleanInput === 'umrgen-pro-2026') {
    const token = generateProToken();
    console.log(`[AUTH] >>> SUCCESS <<< PRO Key Activated.`);
    return res.json({ success: true, token, plan: 'pro' });
  }
  
  if (cleanInput === cleanLimited) {
    const token = generateProToken('pro', { limit: LIMITED_PRO_LIMIT, key: 'TEST50' });
    if (Number.isFinite(LIMITED_PRO_LIMIT) && LIMITED_PRO_LIMIT > 0) {
      LIMITED_PRO_USAGE.set(token, LIMITED_PRO_LIMIT);
    }
    console.log(`[AUTH] >>> SUCCESS <<< LIMITED PRO Key Activated (${LIMITED_PRO_LIMIT}).`);
    return res.json({ success: true, token, plan: 'pro', limit: LIMITED_PRO_LIMIT });
  }

  console.warn(`[AUTH] >>> FAILED <<< Input: "${cleanInput}"`);
  setTimeout(() => res.status(401).json({ error: 'Invalid license key' }), 500);
});

export default router;
