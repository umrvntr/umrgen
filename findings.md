# Findings & Research

## Initial State Discovery
- The project is a "Z-IMAGE app" UI development focus.
- Key technologies observed: Next.js, Vite, TypeScript, Python (for tools), ComfyUI integration suspected.
- Current version reaching 0.9.0.
- Existing files in `architecture/` include `SOP_STORE.md`.
- Existing files in `tools/` include `check_unet_gguf.py`, `check_lora_loader.py`.

- LoRA imports via URL now support real-time progress tracking (bytes/total).
- Frontend UI updated with a progress bar and status indicators.
- Backend provides precise progress data via `/api/loras/import/progress`.
- Component `AppState` and types updated to support `importProgress`.

## LoRA Validation (ComfyUI)
- Fixed "Prompt outputs failed validation" error by implementing a live check against ComfyUI's available LoRA list.
- Previously, the backend was symlinking files with a `sess_` prefix even if they existed globally, causing validation failures because ComfyUI hadn't scanned the new symlink yet.
- Refactored `buildWorkflowKlein` to be `async` to support fetching the LoRA list.
- **LoRA Verification Polling**: Implemented a mandatory polling loop that waits for ComfyUI to include new symlinks in its internal LoRA list (via `getComfyLoraList`) before sending the generation prompt. This guarantees that the LoRA loader won't fail with a "Value not in list" error.
- Fixed a `ReferenceError` where `workflow_lora_name` was used before its declaration.

## Constraints
- Strict adherence to B.L.A.S.T. master system prompt.
- Reliability prioritized: lingering processes must be cleared to avoid port conflicts.
