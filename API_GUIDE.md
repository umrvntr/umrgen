# UMRGEN API Guide for External Agents

Complete reference for integrating with UMRGEN's image generation API.

## Base URL

```
http://localhost:3088
```

## Authentication

All `/api/v1/*` endpoints require Bearer token authentication:

```http
Authorization: Bearer z-img-secret-key-2026
```

Configure via environment variable:
```bash
EXTERNAL_API_KEY=your-secret-key-here
```

---

## Quick Start

```bash
# Generate an image
curl -X POST http://localhost:3088/api/v1/generate \
  -H "Authorization: Bearer z-img-secret-key-2026" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a beautiful sunset over mountains"}'

# Response: {"success":true,"job_id":"ext_abc123","message":"Job accepted and queued"}

# Check status
curl http://localhost:3088/api/v1/status/ext_abc123 \
  -H "Authorization: Bearer z-img-secret-key-2026"
```

---

## Endpoints Overview

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/generate` | POST | Required | Queue image generation |
| `/api/v1/status/:jobId` | GET | Required | Check job status |
| `/api/v1/upload-reference` | POST | Required | Upload reference image |
| `/api/status` | GET | None | Server queue status |
| `/api/history` | GET | None | Generation history |
| `/api/loras` | GET | None | List available LoRAs |
| `/api/loras/import` | POST | None | Import LoRA from URL |
| `/api/upload/lora` | POST | Pro Token | Upload LoRA file |
| `/api/references` | GET | None | List reference images |
| `/api/job/:job_id/stream` | GET | Session | SSE progress stream |
| `/api/job/:job_id/cancel` | POST | None | Cancel queued job |
| `/api/auth/activate-key` | POST | None | Activate PRO license |

---

## Image Generation

### POST /api/v1/generate

Queue a new image generation job.

**Request Body:**

```json
{
  "prompt": "string (required)",
  "negative": "string (optional, default: 'bad quality, blurry')",
  "width": "number (optional, default: 1024, range: 512-2048)",
  "height": "number (optional, default: 1024, range: 512-2048)",
  "steps": "number (optional, default: 4, range: 1-13)",
  "seed": "number (optional, random if omitted)",
  "loras": [
    {
      "name": "lora_filename.safetensors",
      "strength_model": 1.0,
      "strength_clip": 1.0
    }
  ],
  "reference_images": ["ref_image_1.png", "ref_image_2.jpg"]
}
```

**Response (202 Accepted):**

```json
{
  "success": true,
  "job_id": "ext_550e8400-e29b-41d4-a716-446655440000",
  "message": "Job accepted and queued"
}
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 400 | `Safety violation: MINORS` | Blocked content detected |
| 401 | `Unauthorized` | Invalid API key |
| 429 | `CONCURRENT_LIMIT` | Another job already in progress |

**Example:**

```javascript
const response = await fetch('http://localhost:3088/api/v1/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer z-img-secret-key-2026',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'cyberpunk city at night, neon lights, rain',
    negative: 'blurry, low quality, artifacts',
    width: 1024,
    height: 1024,
    steps: 4,
    loras: [
      { name: "cyberpunk_style.safetensors", strength_model: 0.8 }
    ]
  })
});
```

---

## Job Status

### GET /api/v1/status/:jobId

Check the status of a generation job.

**Response:**

```json
{
  "success": true,
  "job_id": "ext_abc123",
  "state": "queued|running|completed|failed",
  "queue_position": 2,
  "eta_seconds": 60,
  "results": {
    "images": [
      { "url": "/outputs/sid_ext_gen/umrgen_123456.png?session_id=sid_ext_gen" }
    ]
  }
}
```

**State Values:**

| State | Description |
|-------|-------------|
| `queued` | Waiting in queue |
| `running` | Currently processing |
| `completed` | Finished successfully |
| `failed` | Generation error |
| `unknown` | Job not found |

**Polling Pattern:**

```javascript
async function waitForCompletion(jobId) {
  while (true) {
    const res = await fetch(`http://localhost:3088/api/v1/status/${jobId}`, {
      headers: { 'Authorization': 'Bearer z-img-secret-key-2026' }
    });
    const status = await res.json();
    
    if (status.state === 'completed') return status.results.images;
    if (status.state === 'failed') throw new Error(status.error);
    if (status.state === 'unknown') throw new Error('Job not found');
    
    await new Promise(r => setTimeout(r, 2000)); // Poll every 2s
  }
}
```

---

## Reference Images

### POST /api/v1/upload-reference

Upload a reference image for img2img or style transfer.

**Request:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| `file` | File | Yes |

**Constraints:**
- Max size: 10MB
- Formats: `.png`, `.jpg`, `.jpeg`, `.webp`
- Max images per session: 10

**Response:**

```json
{
  "success": true,
  "filename": "reference_image.png",
  "url": "/references/sid_ext_gen/reference_image.png?session_id=sid_ext_gen"
}
```

**Example:**

```bash
curl -X POST http://localhost:3088/api/v1/upload-reference \
  -H "Authorization: Bearer z-img-secret-key-2026" \
  -F "file=@./my_reference.png"
```

---

## Server Status

### GET /api/status

Get current server queue status.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | Yes | Session identifier |

**Response:**

```json
{
  "connected": true,
  "queue_size": 3,
  "user_position": 1,
  "user_eta": 30,
  "active_job_id": "ext_abc123",
  "daily_used": 5,
  "daily_remaining": 95,
  "daily_limit": 100
}
```

---

## Reference Images (Internal Session)

### GET /api/references

List uploaded reference images.

**Query Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `session_id` | string | Yes |

**Response:**

```json
[
  { "name": "ref1.png", "url": "/references/sid_xxx/ref1.png?session_id=sid_xxx" },
  { "name": "ref2.jpg", "url": "/references/sid_xxx/ref2.jpg?session_id=sid_xxx" }
]
```

### DELETE /api/references/:filename

Delete a reference image.

**Query Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `session_id` | string | Yes |

---

## LoRA Management

### GET /api/loras

List available LoRA models.

**Query Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `session_id` | string | No |

**Response:**

```json
[
  "style_transfer.safetensors",
  "character_lora.safetensors",
  "art_style.bin"
]
```

### POST /api/loras/import

Import a LoRA from URL (downloads to session folder).

**Request Body:**

```json
{
  "url": "https://civitai.com/api/download/models/12345",
  "filename": "my_lora.safetensors",
  "session_id": "sid_xxx"
}
```

**Response:**

```json
{
  "success": true,
  "filename": "my_lora.safetensors"
}
```

**Constraints:**
- Max size: 2GB
- Allowed formats: `.safetensors`, `.bin`, `.pt`, `.ckpt`
- SSRF protection blocks internal/private networks

### GET /api/loras/import/progress

Check download progress for ongoing import.

**Query Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `session_id` | string | Yes |

**Response:**

```json
{
  "status": "downloading|done|error|idle",
  "bytes": 52428800,
  "total": 104857600,
  "error": null
}
```

### POST /api/upload/lora

Upload a LoRA file directly (requires PRO).

**Request:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| `file` | File | Yes |
| `session_id` | string | Yes |

**Authorization:** Requires PRO token or external API key.

---

## Real-time Progress (SSE)

### GET /api/job/:job_id/stream

Server-Sent Events stream for job progress.

**Query Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `session_id` | string | Yes |

**Event Types:**

```javascript
// Progress update
{ "type": "progress", "step": 2, "total": 4 }

// Preview image (base64)
{ "type": "preview", "image": "base64..." }

// Error
{ "type": "error", "message": "Generation failed" }
```

**Example:**

```javascript
const eventSource = new EventSource(
  `/api/job/ext_abc123/stream?session_id=sid_ext_gen`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};

eventSource.onerror = () => eventSource.close();
```

---

## Job Control

### POST /api/job/:job_id/cancel

Cancel a queued or running job.

**Response:**

```json
{ "success": true }
```

---

## Generation History

### GET /api/history

Get generation history for a session.

**Query Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `session_id` | string | Yes |

**Response:**

```json
[
  {
    "id": "prompt-uuid",
    "job_id": "ext_abc123",
    "timestamp": 1700000000000,
    "prompt": "cyberpunk city",
    "negative": "blurry",
    "imageUrl": "/outputs/sid_xxx/umrgen_123.png?session_id=sid_xxx",
    "width": 1024,
    "height": 1024,
    "steps": 4,
    "loras": [...],
    "reference_images": [...]
  }
]
```

---

## PRO Authentication

### POST /api/auth/activate-key

Activate a PRO license key.

**Request Body:**

```json
{ "key": "YOUR_LICENSE_KEY" }
```

**Response:**

```json
{
  "success": true,
  "token": "eyJhbGc...",
  "plan": "pro",
  "limit": 50
}
```

**PRO Benefits:**
- NSFW content allowed
- Higher daily limits (unlimited with master key)
- LoRA uploads
- Priority queue

---

## Post-Processing Options

The `post_processing` parameter in generation requests supports:

```json
{
  "post_processing": {
    "exposure": 0.1,
    "contrast": 1.1,
    "saturation": 1.0,
    "vibrance": 0.1,
    "temp": 0.1,
    "tint": 0,
    "sharpness": 0.3,
    "vignette": 0.2,
    "grain_amount": 0.3,
    "grain_size": 1.0,
    "glow_small_intensity": 0.2,
    "glow_small_radius": 0.1,
    "glow_small_threshold": 0.5,
    "glow_large_intensity": 0.3,
    "glow_large_radius": 50,
    "glow_large_threshold": 0.7,
    "glare_intensity": 0.5,
    "glare_type": "star_4",
    "glare_length": 2,
    "glare_angle": 45,
    "ca_strength": 0.02,
    "radial_blur_type": "none|spin|zoom",
    "radial_blur_strength": 0.2,
    "lens_distortion": 0.05
  }
}
```

---

## Error Codes Reference

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `Invalid session ID` | Session ID format invalid |
| 400 | `Prompt is required` | Missing prompt |
| 400 | `Safety violation: MINORS` | Blocked content |
| 401 | `Unauthorized` | Invalid/missing API key |
| 401 | `Invalid license key` | Wrong PRO key |
| 403 | `PRO_REQUIRED` | Feature requires PRO |
| 403 | `ADULT_NSFW` | NSFW blocked for free users |
| 403 | `PRO_LIMIT_REACHED` | Limited PRO key exhausted |
| 404 | `Job not found` | Unknown job ID |
| 413 | `File exceeds limit` | File too large |
| 429 | `CONCURRENT_LIMIT` | Job already in progress |
| 429 | `DAILY_LIMIT` | Free daily limit reached |
| 429 | `Rate limit exceeded` | Too many requests (60/min) |
| 500 | Internal error | Server error |

---

## Session ID Format

Sessions use format: `sid_[a-z0-9_-]{5,50}`

**Examples:**
- `sid_ext_gen` (external agent session)
- `sid_user_abc123`
- `sid_test_001`

**Validation Rules:**
- Must start with `sid_`
- 5-50 alphanumeric characters, underscores, or hyphens
- No path traversal (`..`, `/`, `\`)

---

## Rate Limits

| Scope | Limit |
|-------|-------|
| Global API | 60 requests/minute/IP |
| Free users | 100 generations/day/IP |
| PRO users | Unlimited (or limited by key) |

---

## Image Retrieval

Generated images are accessible via:

```
GET /outputs/{session_id}/{filename}?session_id={session_id}
```

**Example:**
```
http://localhost:3088/outputs/sid_ext_gen/umrgen_123456.png?session_id=sid_ext_gen
```

---

## Complete Example: Python Agent

```python
import requests
import time

BASE_URL = "http://localhost:3088"
API_KEY = "z-img-secret-key-2026"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

def generate_image(prompt, **kwargs):
    # Queue generation
    resp = requests.post(
        f"{BASE_URL}/api/v1/generate",
        headers=HEADERS,
        json={"prompt": prompt, **kwargs}
    )
    resp.raise_for_status()
    job_id = resp.json()["job_id"]
    print(f"Job queued: {job_id}")
    
    # Poll for completion
    while True:
        status = requests.get(
            f"{BASE_URL}/api/v1/status/{job_id}",
            headers=HEADERS
        ).json()
        
        if status["state"] == "completed":
            return status["results"]["images"]
        elif status["state"] == "failed":
            raise Exception(status.get("error", "Generation failed"))
        
        print(f"Status: {status['state']}, ETA: {status.get('eta_seconds', '?')}s")
        time.sleep(2)

# Usage
images = generate_image(
    "epic fantasy castle on mountain peak",
    width=1024,
    height=1024,
    steps=4
)

for img in images:
    print(f"Generated: {BASE_URL}{img['url']}")
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3088 | Server port |
| `COMFY_HOST` | 127.0.0.1:8188 | ComfyUI address |
| `EXTERNAL_API_KEY` | z-img-secret-key-2026 | API authentication key |
| `MASTER_PRO_KEY` | umr8888 | Unlimited PRO key |
| `TEST50` | TEST50 | Limited PRO key |
| `TEST50_LIMIT` | 50 | Limited key usage cap |
| `PRO_SECRET` | umrgen-pro-secure-v8 | Token signing secret |
| `CIVITAI_TOKEN` | - | Auto-inject for CivitAI downloads |
| `LORAS_ROOT` | ./USER_LORA | LoRA storage directory |

---

## Changelog

### v0.9.0-klein (Current)
- Flux-2-Klein workflow support
- Reference image integration
- Post-processing suite (CRT)
- Session-based isolation
- External agent API
- Daily usage limits for free users
