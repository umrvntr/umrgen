import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

import { PORT, OUTPUT_DIR } from './config/constants.js';
import { rateLimit } from './middleware/auth.js';
import { cleanupSessions, validateSessionId, validateOutputFilename, getSessionReferencePath } from './services/file-utils.js';
import { cleanupDailyUsage } from './services/queue.js';
import { checkComfyConnection } from './services/comfyui.js';
import generateRoutes from './routes/generate.js';
import lorasRoutes from './routes/loras.js';
import referencesRoutes from './routes/references.js';
import historyRoutes from './routes/history.js';
import authRoutes from './routes/auth.js';
import externalRoutes from './routes/external.js';

const app = express();

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api', rateLimit);

const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/outputs/:session_id/:filename', (req, res) => {
  const { session_id, filename } = req.params;
  const sessionQuery = req.query.session_id;

  if (!validateSessionId(session_id) || sessionQuery !== session_id) {
    return res.status(403).end();
  }
  if (!validateOutputFilename(filename)) {
    return res.status(400).end();
  }

  const filePath = path.join(OUTPUT_DIR, session_id, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// Reference images - serve directly (not under /api)
app.get('/references/:session_id/:filename', (req, res) => {
  const { session_id, filename } = req.params;
  const sessionQuery = req.query.session_id;

  if (!validateSessionId(session_id) || sessionQuery !== session_id) {
    return res.status(403).end();
  }
  if (!validateOutputFilename(filename)) {
    return res.status(400).end();
  }

  const refPath = getSessionReferencePath(session_id);
  const filePath = path.join(refPath, filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

app.use('/api', generateRoutes);
app.use('/api', lorasRoutes);
app.use('/api/references', referencesRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/v1', externalRoutes);

app.use('/api', (err, req, res, next) => {
  console.error('[API ERROR]', err);
  res.status(500).json({
    error: err.message || 'Internal server error'
  });
});

setInterval(cleanupSessions, 60 * 60 * 1000);
setInterval(cleanupDailyUsage, 60 * 60 * 1000);
cleanupSessions();

const startServer = async (port) => {
  const comfyOk = await checkComfyConnection();
  if (!comfyOk) {
    console.error(`>>> WARNING: ComfyUI not detected. Generation requests will fail.`);
  }
  
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`\n>>> UMRGEN v0.9.0-klein Ready on http://localhost:${port}\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[SERVER] Port ${port} is already in use.`);
      process.exit(1);
    } else {
      console.error(`[SERVER] Startup error: ${err.message}`);
    }
  });
};

startServer(PORT);
