# AI Agent Guide: Image Retrieval & Polling

This guide focuses specifically on the logic required to monitor a generation job and retrieve the final image result from the UMRGEN API.

## Retrieval Flow Overview

1. **Submit Job**: Receive `job_id`.
2. **Status Polling**: Check `GET /api/v1/status/{job_id}` until `state` is `completed`.
3. **URL Construction**: Merge `Base URL` + `image_url`.
4. **Download**: Fetch the binary data.

---

## 1. Polling Logic

Do not poll too aggressively. A 2-3 second interval is recommended.

**Endpoint**: `GET https://umrgen.share.zrok.io/api/v1/status/{job_id}`

**Headers**:
```http
Authorization: Bearer z-img-secret-key-2026
```

### Response States to Handle:
- `queued`: Job is in line. Check again in 3s.
- `running`: Job is rendering. Check again in 2s.
- `completed`: SUCCESS. Proceed to download.
- `failed`: ERROR. Read the `error` field and stop polling.

---

## 2. Constructing the Download URL

The `image_url` returned by the status API is a **relative path**. You must prepend the base domain.

**Example Status JSON**:
```json
"image_url": "/outputs/sid_ext_gen/umrgen_847291.png?session_id=sid_ext_gen"
```

**Final Full URL**:
`https://umrgen.share.zrok.io/outputs/sid_ext_gen/umrgen_847291.png?session_id=sid_ext_gen`

---

## 3. Implementation Examples

### Python (Requests)
```python
import requests
import time

def wait_and_download(job_id, api_key):
    base_url = "https://umrgen.share.zrok.io"
    headers = {"Authorization": f"Bearer {api_key}"}
    
    while True:
        status = requests.get(f"{base_url}/api/v1/status/{job_id}", headers=headers).json()
        
        if status["state"] == "completed":
            full_url = f"{base_url}{status['image_url']}"
            print(f"Download started: {full_url}")
            
            # Retrieval (Auth not required for outputs usually, but good practice)
            img_data = requests.get(full_url).content
            with open(f"{job_id}.png", "wb") as f:
                f.write(img_data)
            return True
            
        if status["state"] == "failed":
            print(f"Error: {status.get('error')}")
            return False
            
        time.sleep(3)
```

### JavaScript (Node.js/Axios)
```javascript
const axios = require('axios');
const fs = require('fs');

async function pollAndDownload(jobId, apiKey) {
    const baseUrl = 'https://umrgen.share.zrok.io';
    const config = { headers: { Authorization: `Bearer ${apiKey}` } };

    while (true) {
        const { data } = await axios.get(`${baseUrl}/api/v1/status/${jobId}`, config);
        
        if (data.state === 'completed') {
            const writer = fs.createWriteStream(`./${jobId}.png`);
            const response = await axios.get(`${baseUrl}${data.image_url}`, { responseType: 'stream' });
            response.data.pipe(writer);
            console.log('Image saved!');
            return;
        }
        
        if (data.state === 'failed') throw new Error(data.error);
        await new Promise(r => setTimeout(r, 3000));
    }
}
```

---

## 4. Common Issues

- **403 Forbidden**: Likely an invalid `session_id` query parameter or path. Ensure you use the exact `image_url` string returned by the API.
- **Empty result**: If `completed` state exists but `image_url` is null, the backend failed to save the file.
- **Polling Timeout**: If a job stays `running` for > 60s, it may have crashed.
