# SOP: Backend Workflow Construction

## Goal
Transform the JSON payload from the UI into a valid ComfyUI API workflow (JSON).

## Input
- Prompt, Negative Prompt, Width, Height, Seed, Steps.
- `post_processing`: Object with parameters.
- `loras`: Array of LoRA configurations.
- `reference_images`: Array of filenames.

## Logic Flow (`server.mjs`)

### 1. Model Loading (Chaining)
- Start with `UnetLoaderGGUF` and `CLIPLoader`.
- Loop through `loras`:
    - Inject `LoraLoader` or `LoraLoaderModelOnly` nodes.
    - Chain the MODEL and CLIP outputs to the next LoRA or the subsequent encoding/guiding nodes.

### 2. Conditioning
- Chain `ReferenceLatent` nodes for each reference image.
- Use `CLIPTextEncode` for positive/negative prompts.

### 3. Sampling
- Use `Flux2LatentImage`, `RandomNoise`, `KSamplerSelect`, `Flux2Scheduler`, `CFGGuider`, and `SamplerCustomAdvanced`.

### 4. Post-Processing Suite
- Inject `CRT Post-Process Suite`.
- Map ALL incoming parameters to their respective inputs on this node.
- Ensure type safety (floats vs ints).

### 5. Output
- Use `VAEDecode` followed by `SaveImage`.
