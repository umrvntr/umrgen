# Codebase Structure

**Analysis Date:** 2026-02-22

## Directory Layout

```
[project-root]/
├── app/                    # Next.js-style page components
├── components/             # Reusable React components
├── lib/                    # Client-side utilities and state
├── styles/                 # CSS stylesheets
├── types/                  # TypeScript type definitions
├── config/                 # Configuration files
├── public/                 # Production build output (served by Express)
├── outputs/                # Generated images organized by session
├── sessions/               # Session-specific data (LoRAs, references)
├── USER_LORA/              # Persistent user LoRA models
├── tmp_uploads/            # Temporary file uploads
├── tools/                  # Helper scripts (Python LoRA downloader)
├── tests/                  # Test scripts
├── server.mjs              # Express backend (single file)
├── main.tsx                # React entry point
├── index.html              # HTML template
├── vite.config.js          # Vite configuration for production build
├── vite.dev.config.js      # Vite configuration for dev UI
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── tailwind.config.js      # Tailwind CSS configuration
├── history.json            # Generation history storage
└── debug.log               # Server debug log
```

## Directory Purposes

**`app/`:**
- Purpose: Page-level React components
- Contains: `page.tsx` (main UI), `layout.tsx`, `error.tsx`, `loading.tsx`
- Key files: `app/page.tsx` - Main application UI with all generation controls

**`components/`:**
- Purpose: Reusable UI components
- Contains: Single component currently
- Key files: `components/HistoryDrawer.tsx` - Collapsible history panel

**`lib/`:**
- Purpose: Client-side logic and state management
- Contains: Zustand store definition
- Key files: `lib/store.ts` - Global state management with all actions

**`styles/`:**
- Purpose: Styling
- Contains: Global CSS
- Key files: `styles/globals.css` - All styles including terminal theme, components, animations

**`types/`:**
- Purpose: TypeScript type definitions
- Contains: Interface definitions for entire app
- Key files: `types/index.ts` - All types (AppState, GenerationState, LoraConfig, etc.)

**`config/`:**
- Purpose: Configuration data
- Contains: JSON configuration files
- Key files: `config/learning.content.json` - Content configuration

**`outputs/`:**
- Purpose: Generated image storage
- Contains: Session-specific subdirectories with generated PNG files
- Key files: Auto-created at runtime

**`sessions/`:**
- Purpose: Temporary session data
- Contains: Per-session subdirectories with `loras/` and `references/` folders
- Key files: Auto-created at runtime, cleaned up after 8 hours

**`USER_LORA/`:**
- Purpose: Persistent LoRA model storage
- Contains: User-uploaded LoRA files (.safetensors, .bin)
- Key files: User-managed

**`tools/`:**
- Purpose: Helper scripts
- Contains: Python scripts for external operations
- Key files: `tools/lora_downloader.py` - LoRA download helper

**`tests/`:**
- Purpose: Test scripts
- Contains: Manual verification scripts
- Key files: `tests/verify-*.mjs` - Various verification tests

## Key File Locations

**Entry Points:**
- `main.tsx`: React application entry
- `server.mjs`: Express backend entry
- `index.html`: HTML template for Vite

**Configuration:**
- `vite.config.js`: Build configuration
- `package.json`: Dependencies, scripts
- `tsconfig.json`: TypeScript settings
- `tailwind.config.js`: Tailwind CSS config

**Core Logic:**
- `server.mjs`: All backend logic (API routes, queue, workflow builder)
- `lib/store.ts`: All frontend state and actions
- `types/index.ts`: All TypeScript interfaces

**Styling:**
- `styles/globals.css`: Complete application styles

## Naming Conventions

**Files:**
- React components: PascalCase (e.g., `HistoryDrawer.tsx`)
- TypeScript modules: camelCase (e.g., `store.ts`)
- Config files: lowercase with dots (e.g., `tailwind.config.js`)
- Server: `.mjs` extension for ES modules

**Directories:**
- UPPERCASE for persistent data (e.g., `USER_LORA`)
- lowercase for code directories (e.g., `components/`, `lib/`)

**Session IDs:**
- Format: `sid_[uuid]` (e.g., `sid_097cef02-8f06-48b1-b220-81564d87bbc3`)

## Where to Add New Code

**New Feature:**
- Primary UI: `app/page.tsx` (add controls in sidebar)
- State/actions: `lib/store.ts` (add to AppState interface and implementation)
- Types: `types/index.ts` (add new interfaces)
- Backend: `server.mjs` (add API routes, modify workflow builder if needed)

**New Component:**
- Implementation: `components/[ComponentName].tsx`
- Import in: `app/page.tsx`

**New API Endpoint:**
- Implementation: `server.mjs` (add route handler)
- Types: `types/index.ts` (add response types)
- Frontend call: `lib/store.ts` (add action)

**New Post-Processing Effect:**
- Types: `types/index.ts` (add to `PostProcessConfig`)
- Store defaults: `lib/store.ts` (add to initial state)
- UI controls: `app/page.tsx` (add slider/input in PP section)
- Workflow builder: `server.mjs:725-805` (add to `workflow["20"]` inputs)

**New Style:**
- Add to: `styles/globals.css`
- CSS variables defined in `:root` section

## Special Directories

**`outputs/`:**
- Purpose: Generated images
- Generated: Yes (runtime)
- Committed: No (should be in .gitignore)
- Structure: `outputs/[session_id]/[image_files]`

**`sessions/`:**
- Purpose: Temporary session data
- Generated: Yes (runtime)
- Committed: No
- Cleanup: Auto-deleted after 8 hours
- Structure: `sessions/[session_id]/loras/` and `sessions/[session_id]/references/`

**`public/`:**
- Purpose: Production build output
- Generated: Yes (build process)
- Committed: Typically yes
- Contains: `index.html`, `assets/` (JS/CSS bundles)

**`.planning/`:**
- Purpose: Development planning documents
- Generated: Yes (by GSD tools)
- Committed: Yes
- Contains: `codebase/`, `debug/` subdirectories

---

*Structure analysis: 2026-02-22*
