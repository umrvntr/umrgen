# Project Constitution: Z-IMAGE App

## Data Schemas
### API Key Request
```json
{
  "key_request": {
    "agent_name": "string",
    "site_origin": "string"
  }
}
```

### Generation Request (POST /api/v1/generate)
```json
{
  "prompt": "string",
  "negative_prompt": "string",
  "width": 1024,
  "height": 1024,
  "steps": 4,
  "seed": -1,
  "loras": [
    { "name": "string", "strength": 1.0 }
  ]
}
```

### Job Response
```json
{
  "success": true,
  "job_id": "string",
  "status": "queued|running|completed|failed",
  "image_url": "string (optional)"
}
```

## Behavioral Rules
- Follow B.L.A.S.T. (Blueprint, Link, Architect, Stylize, Trigger) protocol strictly.
- Use A.N.T. 3-layer architecture.
- Reliability over speed.
- Never guess at business logic.
- Self-healing automation via deterministic Python scripts in `tools/`.

## Architectural Invariants
- Layer 1: Architecture (`architecture/`) - Technical SOPs.
- Layer 2: Navigation - Decision making and routing.
- Layer 3: Tools (`tools/`) - Atomic Python scripts.
- Use `.tmp/` for intermediate operations.
- Environment variables in `.env`.

## Maintenance Log
- **2026-02-03**: Initialized B.L.A.S.T. protocol. Preparing for Stable 0.9.0 release.
