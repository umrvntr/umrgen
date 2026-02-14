# SOP: UI State Management (Zustand)

## Goal
Manage the state of Post-Processing parameters and LoRAs, ensuring they are persistent (where relevant) and transmitted correctly to the backend.

## State Structure

### PostProcessing
- **Location**: `useStore` in `lib/store.ts`.
- **Fields**:
    - `ppEnabled`: Boolean.
    - `ppConfig`: Object containing all `CRT Post-Process Suite` parameters.
- **Rules**:
    - `resetPpConfig` should restore defaults.
    - All sliders should update this object in real-time.

### LoRAs
- **Location**: `useStore` in `lib/store.ts`.
- **Fields**:
    - `loras`: Array of `LoraConfig` objects `{ url, filename, strength_model, strength_clip }`.
- **Rules**:
    - Max 3 LoRAs (recommended for stability).
    - Support `addLora` (from URL or upload).
    - Support `removeLora`.

## Integration
- The `generate` action must grab `ppConfig` (if `ppEnabled`) and `loras` and include them in the `POST /api/generate` body.
