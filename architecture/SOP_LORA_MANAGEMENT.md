# SOP: LoRA Management

## Goal
Manage LoRA files (downloads and uploads) and ensure they are available for the ComfyUI workflow.

## Storage
- **Local Path**: `d:\WOMAN\Z-IMAGE app\UI-dev\USER_LORA` (or as configured).
- **Security**: Validate filenames and URLs to prevent path traversal or SSRF.

## LoRA from URL
1. Check if the LoRA already exists locally (hash or filename).
2. If not, download the file to the local storage directory.
3. Update its status in the session.

## LoRA from Upload
1. Use `multer` to handle file uploads.
2. Store in the local LoRA directory with a unique, sanitized name.
3. Return the filename to the UI.

## Workflow Integration
- The backend must check the filesystem for the LoRA's existence before attempting to run the workflow.
- Emit progress/status via SSE if a download is happening.
