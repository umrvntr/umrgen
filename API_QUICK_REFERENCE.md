# UMRGEN API Quick Reference

**Base URL**: `https://umrgen.share.zrok.io`  
**Auth**: `Authorization: Bearer z-img-secret-key-2026`

---

## Generate Image

```bash
curl -X POST https://umrgen.share.zrok.io/api/v1/generate \
  -H "Authorization: Bearer z-img-secret-key-2026" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cat in space", "steps": 4, "width": 1024, "height": 1024}'
```

**Response**: `{"success": true, "job_id": "ext_xxxxx"}`

---

## Check Status

```bash
curl -H "Authorization: Bearer z-img-secret-key-2026" \
  https://umrgen.share.zrok.io/api/v1/status/ext_xxxxx
```

**States**: `queued` → `running` → `completed` (or `failed`)

---

## Download Image

When `state: "completed"`, use `image_url` from response:

```bash
curl -L "https://umrgen.share.zrok.io/outputs/sid_ext_gen/umrgen_123456.png?session_id=sid_ext_gen" -o image.png
```

---

## Python One-Liner Flow

```python
import requests, time

API = "https://umrgen.share.zrok.io"
KEY = "z-img-secret-key-2026"
H = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

# Send
job = requests.post(f"{API}/api/v1/generate", json={"prompt": "neon city", "steps": 4}, headers=H).json()["job_id"]

# Poll
while (s := requests.get(f"{API}/api/v1/status/{job}", headers=H).json())["state"] not in ["completed", "failed"]:
    time.sleep(2)

# Download
if s["state"] == "completed":
    open("out.png", "wb").write(requests.get(f"{API}{s['image_url']}").content)
```

---

## Parameters

| Field | Default | Range |
|-------|---------|-------|
| `prompt` | required | max 2000 chars |
| `negative` | "bad quality" | optional |
| `width` | 1024 | 512-2048 |
| `height` | 1024 | 512-2048 |
| `steps` | 4 | 1-50 |
| `seed` | random | -1 for random |