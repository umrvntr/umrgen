import { RATE_LIMIT_WINDOW, MAX_REQUESTS_PER_WINDOW, EXTERNAL_API_KEY } from '../config/constants.js';
import { rateLimitMap, cleanupRateLimit } from '../services/queue.js';
import { verifyProToken } from '../services/comfyui.js';

export function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowKey = `${ip}:${Math.floor(now / RATE_LIMIT_WINDOW)}`;

  const currentCount = rateLimitMap.get(windowKey) || 0;
  if (currentCount >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }

  rateLimitMap.set(windowKey, currentCount + 1);

  if (Math.random() < 0.01) {
    cleanupRateLimit();
  }

  next();
}

export function authenticateExternalAgent(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${EXTERNAL_API_KEY}`) {
    console.warn(`[AUTH_API] Failed attempt. Received: "${authHeader ? authHeader.substring(0, 15) : 'none'}..."`);
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }
  next();
}

export function checkProStatus(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  
  if (authHeader === `Bearer ${EXTERNAL_API_KEY}`) {
    return { isPro: true, token: null, plan: 'pro' };
  }
  
  const payload = verifyProToken(token);
  return { 
    isPro: payload.plan === 'pro', 
    token, 
    plan: payload.plan,
    limit: payload.limit 
  };
}

export function validateProForLora(req, res, next) {
  const { isPro } = checkProStatus(req);
  if (!isPro) {
    return res.status(403).json({ 
      error: 'PRO_REQUIRED', 
      message: 'LoRA uploads require PRO membership.' 
    });
  }
  next();
}
