# UMRGEN (Z-IMAGE)

Standalone local AI image generator using Z-Image-Turbo via ComfyUI.

## Quick Reference

```bash
npm run start         # Production server (port 3088)
npm run dev           # Vite dev server (port 5174) + backend
npm run dev:server    # Backend with --watch mode
npm run dev:ui        # Vite dev server for frontend (port 5174)
npm run dev:ui:separate  # Dev UI on separate port (5175) - for feature testing
npm run dev:all       # Run server + prod UI + dev UI simultaneously
npm run build         # Build prod UI to public/
npm run build:dev    # Build dev UI to public-dev/
```

## Architecture

- **Backend**: Express.js server (`server.mjs`) - handles API, queue management, ComfyUI communication
- **Frontend**: Next.js + TypeScript (`app/`, `components/`) with terminal/retro-style UI
- **Build**: Vite (`vite.config.js`)
- **External**: Requires ComfyUI running on `127.0.0.1:8188`

## Project Structure

```
server.mjs          # Express backend - API routes, job queue, ComfyUI integration
app/                # Next.js pages (page.tsx, layout.tsx, error.tsx, loading.tsx)
components/         # React components (Terminal*, ScanlineEffect, CommandPrompt)
lib/store.ts        # Client-side state management
styles/             # CSS styles
config/             # Configuration files (learning.content.json)
data/               # Runtime data (history.json, presets.json)
outputs/            # Generated images organized by session
sessions/           # Session LoRA storage (auto-cleanup after 8hrs)
USER_LORA/          # Persistent user LoRA models
```

## Key Concepts

### Session System
- Sessions use format: `sid_[alphanumeric]{5,50}`
- Session data (LoRAs, outputs) auto-expires after 8 hours
- Each session has isolated LoRA storage

### Job Queue
- Global queue with max 30 jobs
- One active job per session/IP at a time
- Jobs stream progress via SSE at `/api/job/:id/stream`

### Pro/Free Tiers
- Pro unlocks: NSFW content, Face Detailer, Upscale >2x
- License keys: `MASTER_PRO_KEY` (unlimited), `TEST50` (limited uses)
- Tokens use HMAC-SHA256 signing

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/generate` | Queue image generation |
| `GET /api/job/:id/status` | Get job status |
| `GET /api/job/:id/stream` | SSE progress stream |
| `POST /api/upload/lora` | Upload LoRA file |
| `POST /api/loras/import` | Import LoRA from URL |
| `GET /api/loras` | List session LoRAs |
| `POST /api/auth/activate-key` | Activate pro license |

## Environment Variables

```
PORT=3088              # Server port
COMFY_HOST=127.0.0.1:8188  # ComfyUI address
MASTER_PRO_KEY=...     # Unlimited pro key
TEST50=TEST50          # Limited pro key
TEST50_LIMIT=50        # Limited key usage cap
PRO_SECRET=...         # Token signing secret
```

## Development Notes

- Path alias: `@/*` maps to project root
- TypeScript strict mode enabled
- Security: Rate limiting (60 req/min), session ID validation, SSRF protection
- LoRA size limit: 500MB
