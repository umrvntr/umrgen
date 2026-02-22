# Architecture

**Analysis Date:** 2026-02-22

## Pattern Overview

**Overall:** Client-Server with Job Queue

**Key Characteristics:**
- Single-page React application (SPA) with terminal-style UI
- Express.js backend handles API, job queuing, and ComfyUI integration
- WebSocket communication for real-time progress updates
- Session-based isolation for multi-user support
- Pro/Free tier licensing system with token-based authentication

## Layers

**Frontend (React + TypeScript):**
- Purpose: User interface for image generation parameters, LoRA management, reference images, and history
- Location: `app/`, `components/`, `lib/`, `styles/`
- Contains: React components, Zustand state management, TypeScript types
- Depends on: Backend API endpoints
- Used by: End users via browser

**Backend (Express.js):**
- Purpose: API server, job queue management, ComfyUI orchestration, file handling
- Location: `server.mjs` (single-file monolith ~1757 lines)
- Contains: API routes, workflow builder, queue processor, authentication
- Depends on: ComfyUI external service, filesystem
- Used by: Frontend via REST API and SSE

**External Service (ComfyUI):**
- Purpose: AI image generation engine
- Location: External process on `127.0.0.1:8188`
- Contains: Flux-2-Klein model, LoRA processing, VAE decoding
- Depends on: GPU resources
- Used by: Backend via HTTP/WebSocket

## Data Flow

**Image Generation Flow:**

1. User configures parameters (prompt, dimensions, LoRAs, references) in frontend
2. Frontend calls `POST /api/generate` with session ID
3. Backend validates request, checks content policy, queues job
4. Backend processor picks up job, builds ComfyUI workflow JSON
5. Backend sends workflow to ComfyUI via HTTP POST
6. Backend opens WebSocket to ComfyUI for progress updates
7. Progress updates broadcast to frontend via Server-Sent Events (SSE)
8. On completion, backend fetches generated images from ComfyUI
9. Images saved to session-specific output directory
10. Frontend displays result, adds to history

**State Management:**
- Frontend: Zustand store (`lib/store.ts`) manages all client state
- Session ID persisted in localStorage (`umrgen_sid`)
- Pro token persisted in localStorage (`umrgen_pro_token`)
- Backend: In-memory queue (`GLOBAL_QUEUE` array), file-based history

## Key Abstractions

**Session System:**
- Purpose: Isolate user data (outputs, LoRAs, references) across multiple concurrent users
- Examples: `server.mjs:62-88`, `lib/store.ts:6-20`
- Pattern: UUID-based session IDs with `sid_` prefix, validated via regex

**Job Queue:**
- Purpose: Sequential processing of generation requests with concurrency control
- Examples: `server.mjs:343-501`
- Pattern: Global array with state machine (queued → running → completed/failed)

**Workflow Builder:**
- Purpose: Translate UI parameters into ComfyUI-compatible JSON workflow
- Examples: `server.mjs:503-811` (`buildWorkflowKlein`)
- Pattern: Programmatic construction of node graph with dynamic LoRA injection

**Post-Processing Config:**
- Purpose: Image enhancement parameters (glow, glare, grain, etc.)
- Examples: `types/index.ts:2-31`, `lib/store.ts:60-86`
- Pattern: Typed configuration object passed through to ComfyUI nodes

## Entry Points

**Frontend Entry:**
- Location: `main.tsx`
- Triggers: Browser loading `index.html`
- Responsibilities: React root creation, global styles import

**Backend Entry:**
- Location: `server.mjs:1733-1756` (`startServer`)
- Triggers: `node server.mjs` or `npm run start`
- Responsibilities: ComfyUI connection check, Express server startup

**Development Entry:**
- Location: `vite.config.js`
- Triggers: `npm run dev:ui`
- Responsibilities: Vite dev server with API proxy to backend

## Error Handling

**Strategy:** Multi-layer error handling with user feedback

**Patterns:**
- API routes return JSON errors with status codes
- Frontend catches errors and displays in UI
- SSE broadcasts error messages to connected clients
- Job failures stored with error message for polling clients
- Global Express error handler for API routes (`server.mjs:1706-1713`)

## Cross-Cutting Concerns

**Logging:** Console output + file logging to `debug.log` via `debugLog()` function

**Validation:**
- Session ID validation via regex (`validateSessionId`)
- Filename sanitization for uploads
- Path traversal protection
- SSRF protection for LoRA imports
- Content policy scanning (`scanText`)

**Authentication:**
- Pro token system using HMAC-SHA256 signatures
- Bearer token in Authorization header
- External API key for agent integration
- Session-based ownership verification for SSE streams

**Rate Limiting:**
- In-memory rate limiter: 60 requests/minute per IP
- Applied to all `/api/*` routes

**Security Headers:**
- X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- Referrer-Policy set

---

*Architecture analysis: 2026-02-22*
