# AI Agent Guide: UMRGEN API

This guide is designed for AI agents to interact with the UMRGEN backend for automated image generation.

## Technical Details

- **Protocol**: HTTPS
- **Base URL**: `https://umrgen.share.zrok.io`
- **Format**: JSON
- **Auth Strategy**: Bearer Token in `Authorization` header
- **Engine**: Z-Image Turbo (Klein) for fast 4-step generation

---

## 1. Authentication

All requests MUST include the API key in the headers.

```http
Authorization: Bearer z-img-secret-key-2026
Content-Type: application/json
```

> [!NOTE]
> The default API key is `z-img-secret-key-2026`. Ensure you include the `Bearer` prefix.

---

## 2. Generate Image (POST)

Trigger an image generation job using the Klein engine.

**Endpoint**: `POST https://umrgen.share.zrok.io/api/v1/generate`

**Request Payload Example**:
```json
{
  "prompt": "Highly detailed portrait of a female cyborg, cinematic lighting, 8k resolution",
  "negative": "blurry, low quality, distorted anatomy",
  "width": 1024,
  "height": 1024,
  "steps": 4,
  "seed": -1,
  "loras": [
    { "name": "cyber-detail-v1", "strength": 0.8 }
  ]
}
```

**cURL Example**:
```bash
curl -X POST https://umrgen.share.zrok.io/api/v1/generate \
  -H "Authorization: Bearer z-img-secret-key-2026" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "cyberpunk cat with neon lights",
    "steps": 4,
    "width": 1024,
    "height": 1024
  }'
```

**Success Response (Status 202 Accepted)**:
```json
{
  "success": true,
  "job_id": "ext_xxxx-xxxx-xxxx-xxxx",
  "message": "Job accepted and queued"
}
```

---

## 3. Check Status & Get Result (GET)

Poll this endpoint to retrieve the status and final image URL.

**Endpoint**: `GET https://umrgen.share.zrok.io/api/v1/status/{job_id}`

**cURL Example**:
```bash
curl -H "Authorization: Bearer z-img-secret-key-2026" \
  https://umrgen.share.zrok.io/api/v1/status/ext_xxxx-xxxx-xxxx-xxxx
```

**Response States**:
- `queued`: Waiting in queue
- `running`: Currently generating
- `completed`: Finished (includes `image_url`)
- `failed`: Error occurred (includes `error` message)

**Example Completed Response**:
```json
{
  "success": true,
  "job_id": "ext_xxxx-xxxx-xxxx-xxxx",
  "state": "completed",
  "image_url": "/outputs/sid_ext_gen/umrgen_123456.png?session_id=sid_ext_gen"
}
```

---

## 4. Download Image

Construct the full image URL by combining the base URL with the `image_url`:
```
https://umrgen.share.zrok.io/outputs/sid_ext_gen/umrgen_123456.png?session_id=sid_ext_gen
```

**cURL Download**:
```bash
curl -L https://umrgen.share.zrok.io/outputs/sid_ext_gen/umrgen_123456.png?session_id=sid_ext_gen \
  -o generated_image.png
```

---

## 5. Full Workflow (AI Agent Logic)

```python
import requests
import time

BASE_URL = "https://umrgen.share.zrok.io"
API_KEY = "z-img-secret-key-2026"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Step 1: Submit generation request
payload = {
    "prompt": "cyberpunk cat with neon lights",
    "steps": 4,
    "width": 1024,
    "height": 1024
}

response = requests.post(f"{BASE_URL}/api/v1/generate", json=payload, headers=HEADERS)
job_id = response.json()["job_id"]

# Step 2: Poll for completion
while True:
    status_resp = requests.get(f"{BASE_URL}/api/v1/status/{job_id}", headers=HEADERS)
    status = status_resp.json()
    
    if status["state"] == "completed":
        image_url = f"{BASE_URL}{status['image_url']}"
        print(f"Image ready: {image_url}")
        break
    elif status["state"] == "failed":
        print(f"Generation failed: {status.get('error')}")
        break
    
    time.sleep(3)  # Poll every 3 seconds

# Step 3: Download image
image_data = requests.get(image_url, headers=HEADERS)
with open("generated.png", "wb") as f:
    f.write(image_data.content)
```

---

## 6. Technical Specifications

- **Model**: Z-Image Turbo (Stable Diffusion XL Turbo variant)
- **Optimal Steps**: 4 (recommended for speed/quality balance)
- **Max Resolution**: 2048x2048
- **Generation Time**: ~3-8 seconds (depends on GPU load)
- **Supported Formats**: PNG
- **Rate Limit**: 60 requests/minute per API key

---

## 7. Security & Content Policy

- **Content Filter**: Prompts are scanned for prohibited content (Minors, NSFW for non-pro keys)
- **NSFW Detection**: Generated images are automatically filtered based on key tier
- **Violations**: Return `400 Bad Request` with error message
- **API Key**: Keep your key secret - treat it like a password

---

## 8. Error Handling

**Common Error Responses**:
```json
{
  "success": false,
  "error": "Invalid API key"
}
```
```json
{
  "success": false,
  "error": "Safety violation: MINORS"
}
```
```json
{
  "success": false,
  "error": "Queue is full, try again later"
}
```

**Recommended Retry Strategy**:
- `401 Unauthorized`: Check API key
- `429 Too Many Requests`: Wait 60 seconds
- `500 Server Error`: Retry after 5 seconds (max 3 attempts)
- `503 Service Unavailable`: Server is restarting, wait 30 seconds

---

## 9. Best Practices for AI Agents

1. **Always check authentication** before starting workflows
2. **Poll with backoff**: Start at 2s, increase to 5s if queue is long
3. **Handle failures gracefully**: Implement retry logic
4. **Cache job_ids**: Don't lose track of in-progress generations
5. **Validate prompts**: Check for empty/invalid input before submitting
6. **Monitor rate limits**: Track request count per minute

---

## Support

- **Issues**: Report problems via GitHub
- **Telegram**: @umr133
- **Documentation**: https://umrgen.share.zrok.io/docs (if available)

---

**Philosophy**: "Not your GPU, not your AI" - UMRGEN provides local generation power through accessible API, no subscription required.
