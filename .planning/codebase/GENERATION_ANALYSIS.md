# Image Generation Flow Analysis: "Engine Bootable But Not Working"

**Analysis Date:** 2026-02-17  
**Focus:** Identifying failure points in the image generation pipeline from frontend to ComfyUI

---

## Executive Summary

Based on analysis of `server.mjs`, `lib/store.ts`, `app/page.tsx`, and `debug.log`, the engine **HAS BEEN WORKING** (successful generations logged) but has **intermittent failures** caused by specific bugs in the reference image handling and model name validation paths.

**Critical Finding:** The system is NOT fundamentally broken - generations complete successfully when certain edge cases are avoided. The failures are caused by:

1. **NULL path error** when external API sends `reference_images` with null/undefined entries
2. **Case-sensitive model name validation** in ComfyUI (Q6_k vs Q6_K)
3. **Missing error handling** in the WebSocket completion detection
4. **Silent failures** in workflow output processing

---

## Generation Flow Architecture

```
┌─────────────────┐     POST /api/generate      ┌─────────────────────────────────────────────────────────┐
│   Frontend      │ ───────────────────────────>│  server.mjs                                              │
│   (store.ts)    │                             │  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐   │
└─────────────────┘                             │  │   Queue     │->│   processQueue│->│ buildWorkflow │   │
        │                                       │  │  GLOBAL_QUEUE│  │   (line 419) │  │  (line 497)   │   │
        │                                       │  └─────────────┘  └──────────────┘  └───────┬───────┘   │
        │                                       │                                              │           │
        │                                       │  ┌───────────────────────────────────────────▼─────────┐  │
        │                                       │  │  ComfyUI Integration                                │  │
        │                                       │  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
        │                                       │  │  │ queuePrompt │->│waitForCompletion│->│processOutputs│  │  │
        │                                       │  │  │  (line 838) │  │  (line 852)    │  │  (line 806) │  │  │
        │                                       │  │  └─────────────┘  └──────────────┘  └─────────────┘  │  │
        │                                       │  └────────────────────────────────────────────────────┘  │
        │                                       └─────────────────────────────────────────────────────────┘
        │                                                    │
        │                                                    │ WebSocket + HTTP
        │                                                    ▼
        │                                       ┌─────────────────────────┐
        │                                       │    ComfyUI @ 127.0.0.1  │
        │                                       │         :8188           │
        │                                       └─────────────────────────┘
        │                                                    │
        ▼                                                    ▼
┌─────────────────┐                          ┌──────────────────────────┐
│  EventSource    │ <──── SSE /api/job/:id/stream  │  Job Status Polling      │
│  (store.ts:661) │                          │  /api/job/:id/status     │
└─────────────────┘                          └──────────────────────────┘
```

---

## Critical Failure Points Identified

### 1. NULL Path Error in Reference Image Processing **(HIGH PRIORITY)**

**Location:** `server.mjs` lines 430-440, 687-703

**Issue:** When external API (`/api/v1/generate`) sends `reference_images` that contains null/undefined entries or entries without proper `session_id`, the `getSessionReferencePath()` function receives null, causing:

```
[QUEUE] Job ext_0a1ce757-8a4b-4a7e-a172-dec222040747 FAILED: 
The "path" argument must be of type string. Received null
```

**Problem Code:**
```javascript
// Line 432-438
if (p.session_id && p.reference_images && Array.isArray(p.reference_images)) {
  const refPath = getSessionReferencePath(p.session_id);  // OK
  for (const filename of p.reference_images) {
    const fullPath = path.join(refPath, filename);
    if (fs.existsSync(fullPath)) {
      referenceImages.push(fullPath);  // Push validated path
    }
  }
}

// Line 687-703 - referenceImages.forEach uses path directly
referenceImages.forEach((imagePath) => {
  workflow[loadId] = { inputs: { image: imagePath }, class_type: "LoadImage" };  // imagePath could be null!
  // ...
});
```

**Fix Required:**
```javascript
// Add null check before processing
referenceImages.forEach((imagePath) => {
  if (!imagePath || typeof imagePath !== 'string') {
    console.warn(`[QUEUE] Skipping invalid reference image path: ${imagePath}`);
    return;
  }
  // ... process
});
```

**Impact:** External API jobs with reference images fail completely. Frontend jobs work because they validate before sending.

---

### 2. Case-Sensitive Model Name Validation **(MEDIUM PRIORITY)**

**Location:** `server.mjs` lines 505-518

**Issue:** ComfyUI's `LoaderGGUF` node validates model names case-sensitively. The code has a fix for Q8_0 but Q6_k vs Q6_K mismatch still occurs:

```
[COMFY] Prompt FAIL: {"error": {"type": "prompt_outputs_failed_validation", ...
"details": "gguf_name: 'flux-2-klein-9b-Q6_k.gguf' not in 
['flux-2-klein-9b-Q4_K_M.gguf', 'flux-2-klein-9b-Q6_K.gguf']"
```

**Problem Code:**
```javascript
// Lines 505-518
let activeUnet = unet_name;
if (activeUnet === "flux-2-klein-9b-Q8_0.gguf") {
  activeUnet = "flux-2-klein-9b-Q6_K.gguf";  // Only fixes Q8_0
}
// Missing: Q6_k -> Q6_K normalization
```

**Fix Required:**
```javascript
// Normalize case before comparison
let activeUnet = unet_name;
if (activeUnet.toLowerCase() === "flux-2-klein-9b-q8_0.gguf") {
  activeUnet = "flux-2-klein-9b-Q6_K.gguf";
}
// Also normalize Q6_k to Q6_K
if (activeUnet.toLowerCase() === "flux-2-klein-9b-q6_k.gguf") {
  activeUnet = "flux-2-klein-9b-Q6_K.gguf";
}
```

---

### 3. WebSocket Silent Failure on Connection Drop **(MEDIUM PRIORITY)**

**Location:** `server.mjs` lines 852-882

**Issue:** The `waitForCompletion` function has a race condition. If WebSocket disconnects before receiving the completion signal, it rejects with "WebSocket closed before completion signal" but this error is only logged to debug - the job is marked as failed but the user gets no clear feedback.

**Problem Code:**
```javascript
ws.on("close", () => completed ? resolve() : reject(new Error("WebSocket closed before completion signal")));
ws.on("error", (err) => reject(err));  // Rejects but error message may be lost
```

**The Bigger Problem:** The `processQueue` catch block (line 484-487) catches this but:
```javascript
catch (err) {
  debugLog(`[QUEUE] Job ${nextJob.job_id} FAILED: ${err.message}`);  // Only to debug.log!
  nextJob.state = "failed";
  nextJob.error = err.message;
  // Error does NOT get broadcast to SSE streams - frontend won't know why it failed!
}
```

**Impact:** Job appears to hang or fail silently from frontend perspective.

---

### 4. Error Propagation Gap in processComfyOutputs **(MEDIUM PRIORITY)**

**Location:** `server.mjs` lines 806-834

**Issue:** If ComfyUI returns empty outputs or the history endpoint fails, `processComfyOutputs` returns an empty array. The calling code (line 462-483) treats this as success but with no images, resulting in a confusing state.

```javascript
async function processComfyOutputs(promptId, session_id) {
  const history = await fetch(`${COMFY_HTTP}/history/${promptId}`).then(r => r.json());
  const outputs = history[promptId]?.outputs;
  if (!outputs) return [];  // <-- Silent empty return
  // ...
}
```

**Calling Code Issue:**
```javascript
const images = await processComfyOutputs(promptId, p.session_id);
nextJob.state = "completed";
nextJob.results = { images };  // Could be empty array!
// No check: if images.length === 0, still marks as completed
```

---

### 5. Missing COMFY_HOST Connectivity Check **(LOW PRIORITY)**

**Location:** Throughout `server.mjs`

**Issue:** No startup check ensures ComfyUI is actually running at `COMFY_HOST`. If ComfyUI is not started, all requests fail with generic ECONNREFUSED errors.

**Recommendation:** Add health check on startup:
```javascript
async function checkComfyConnection() {
  try {
    const resp = await fetch(`${COMFY_HTTP}/system_stats`);
    return resp.ok;
  } catch {
    return false;
  }
}
```

---

## Error Handling Gaps

### Where Errors Are Caught vs Lost

| Function | Catch Block | Error Propagation | Frontend Notification |
|----------|-------------|-------------------|----------------------|
| `processQueue` | ✅ Line 484 | Sets `job.error` | ❌ NOT broadcast to SSE |
| `buildWorkflowKlein` | ❌ No try/catch | Throws to caller | Through processQueue |
| `waitForCompletion` | ✅ Line 880 | Rejects promise | Lost in processQueue |
| `processComfyOutputs` | ❌ No try/catch | Throws to caller | Through processQueue |
| `queuePrompt` | ❌ No try/catch | Throws to caller | Through processQueue |

### Critical Gap: SSE Error Broadcasting

The `broadcastToJob` function (lines 389-395) is only called for progress updates and preview images - **NOT for errors**. When a job fails in `processQueue`, the error is written to `job.error` but never broadcast to the SSE stream.

**Fix Required:**
```javascript
// In processQueue catch block (after line 487)
broadcastToJob(nextJob.job_id, { type: 'error', message: err.message });
```

And in frontend `store.ts` (around line 682):
```javascript
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'error') {
    useStore.setState((s) => ({
      generation: { ...s.generation, status: 'error', error: data.message },
    }));
    cleanupResources();
    clearInterval(pollInterval);
  }
  // ... existing handlers
};
```

---

## File Paths Summary

| File | Purpose | Key Lines |
|------|---------|-----------|
| `server.mjs` | Express backend, queue management | 419-495 (processQueue), 497-798 (buildWorkflow), 852-882 (waitForCompletion) |
| `lib/store.ts` | Frontend state, SSE client | 649-741 (startJobLifecycle) |
| `app/page.tsx` | UI components | 1-1200+ (generation status display) |
| `debug.log` | Debug output | Evidence of both success and failure patterns |

---

## Most Likely Current Failure Scenario

Based on log analysis, if the engine "is bootable but not working":

1. **ComfyUI is likely NOT running** or is not accessible at `127.0.0.1:8188`
2. **OR** The external agent is sending requests with malformed `reference_images` array
3. **OR** The model file names in ComfyUI don't match the hardcoded names in `server.mjs`

### Quick Diagnosis Steps

```bash
# 1. Check if ComfyUI is running
curl http://127.0.0.1:8188/system_stats

# 2. Check what models are available
curl http://127.0.0.1:8188/object_info/LoaderGGUF

# 3. Check server debug.log for specific error
tail -f debug.log | grep -E "FAILED|Error|FAIL"
```

---

## Recommended Fixes (In Priority Order)

### Immediate (Fixes "Not Working")

1. **Add error broadcasting to SSE** - Users need to see why jobs fail
2. **Fix NULL path check** in reference image processing
3. **Add case normalization** for model names
4. **Add ComfyUI connectivity check** on startup

### Short Term

5. **Add validation** for `reference_images` entries before processing
6. **Handle empty outputs** in `processComfyOutputs` as failure, not success
7. **Add retry logic** for WebSocket disconnections

### Long Term

8. **Refactor error handling** - Centralize error propagation
9. **Add health check endpoint** for external monitoring
10. **Add metrics/logging** for queue depth, processing times

---

*Analysis complete. The engine architecture is sound - these are specific bugs with clear fixes.*
