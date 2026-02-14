# External API Integration Guide: UMRGEN

This guide explains how external agents can integrate with UMRGEN to generate images using prompts and reference images.

## 1. Authentication

All requests MUST include the API key in the `Authorization` header.

```http
Authorization: Bearer z-img-secret-key-2026
Content-Type: application/json
```

---

## 2. Upload Reference Image (POST)

Before generating with an image, you must upload it to the server.

**Endpoint**: `POST /api/v1/upload-reference`

**Parameters**:
- `file`: The image file (Multipart/form-data)

**cURL Example**:
```bash
curl -X POST https://umrgen.share.zrok.io/api/v1/upload-reference \
  -H "Authorization: Bearer z-img-secret-key-2026" \
  -F "file=@/path/to/your/image.jpg"
```

**Success Response**:
```json
{
  "success": true,
  "filename": "image_1739268682123.jpg",
  "url": "/references/sid_ext_gen/image_1739268682123.jpg?session_id=sid_ext_gen"
}
```

---

## 3. Generate Image with References (POST)

Trigger an image generation job using a prompt and one or more reference images.

**Endpoint**: `POST /api/v1/generate`

**Payload**:
```json
{
  "prompt": "Highly detailed portrait of a female cyborg, cinematic lighting",
  "negative": "blurry, low quality",
  "width": 1024,
  "height": 1024,
  "steps": 4,
  "reference_images": ["image_1739268682123.jpg"]
}
```

**cURL Example**:
```bash
curl -X POST https://umrgen.share.zrok.io/api/v1/generate \
  -H "Authorization: Bearer z-img-secret-key-2026" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Highly detailed portrait, cinematic lighting",
    "reference_images": ["image_1739268682123.jpg"]
  }'
```

**Success Response**:
```json
{
  "success": true,
  "job_id": "ext_xxxx-xxxx-xxxx-xxxx",
  "message": "Job accepted and queued"
}
```

---

## 4. Check Status (GET)

Poll this endpoint to retrieve the status and final image URL.

**Endpoint**: `GET /api/v1/status/{job_id}`

**Success Response (Completed)**:
```json
{
  "success": true,
  "job_id": "ext_xxxx-xxxx-xxxx-xxxx",
  "state": "completed",
  "image_url": "/outputs/sid_ext_gen/umrgen_123456.png?session_id=sid_ext_gen"
}
```

---

## 5. Full Workflow Example (Python)

```python
import requests
import time

BASE_URL = "https://umrgen.share.zrok.io"
API_KEY = "z-img-secret-key-2026"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

# 1. Upload Reference
files = {'file': open('style_reference.jpg', 'rb')}
upload_resp = requests.post(f"{BASE_URL}/api/v1/upload-reference", headers=HEADERS, files=files)
ref_filename = upload_resp.json()["filename"]

# 2. Generate
payload = {
    "prompt": "A futuristic city in the style of the reference",
    "reference_images": [ref_filename]
}
gen_resp = requests.post(f"{BASE_URL}/api/v1/generate", headers=HEADERS, json=payload)
job_id = gen_resp.json()["job_id"]

# 3. Poll Status
while True:
    status_resp = requests.get(f"{BASE_URL}/api/v1/status/{job_id}", headers=HEADERS)
    status = status_resp.json()
    if status["state"] == "completed":
        print(f"Result: {BASE_URL}{status['image_url']}")
        break
    time.sleep(2)
```

---

## 6. Error Handling

| Status Code | Error | Description |
|---|---|---|
| `401` | `Unauthorized` | Invalid or missing API Key. |
| `429` | `CONCURRENT_LIMIT` | External agent already has a generation in progress. |
| `400` | `Safety violation` | The prompt contains blocked keywords. |
| `404` | `Job not found` | The `job_id` provided is invalid or expired. |
| `413` | `File exceeds limit` | Uploaded reference image exceeds 10MB. |
