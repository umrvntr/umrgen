# UMRGEN Quick Start Guide

## 🚀 Running the Application

### Option 1: Development Mode (Recommended for Testing)

**Step 1: Start the Backend Server**
```bash
npm run server
```
This starts the Express backend on **http://localhost:3088**

**Step 2: Start Next.js Dev Server (in a new terminal)**
```bash
npm run dev
```
This starts the Next.js frontend on **http://localhost:3000**

**Step 3: Open Browser**
Visit: **http://localhost:3000**

### Option 2: Production Mode

```bash
# Build for production
npm run build

# Start production server
npm start
```

Production server runs on: **http://localhost:3000**

---

## 🎮 Using the Application

### 1. **Enter Your Prompt**
In the left sidebar (CONTROL_PANEL), type your image description in the PROMPT_INPUT field.

### 2. **Configure Settings** (Optional)
- **Reference Images**: Upload up to 5 images to guide the generation (Character/Style Reference)
- **Aspect Ratio**: Choose from 1:1, 16:9, 9:16, or 21:9
- **Upscale Factor**: Adjust from 1x to 4x
- **Post Processing**: Enable and adjust:
  - Exposure (-2 to 2)
  - Contrast (0 to 2)
  - Vibrance (0 to 2)
  - Grain (0 to 2)

### 3. **Generate**
Click the **[ GENERATE ]** button

### 4. **Watch Progress**
- Progress bar appears at top of viewport
- Real-time previews shown during generation
- Status displayed in terminal footer

### 5. **View Result**
Final image appears with retro terminal border effect

---

## 🎨 UI Features

### Retro Terminal Aesthetic
- **Green phosphor glow** on text
- **CRT scanlines** overlay
- **Moving scanline effect** for authenticity
- **Screen vignette** for curved CRT look
- **ASCII art** branding
- **Terminal-style borders** with colored indicator dots

### Terminal Elements
- **Command prompts**: `user@z-image-turbo:~$`
- **Status badges**: Color-coded (idle/running/success/error)
- **Progress indicators**: Animated bars
- **Error states**: Full error UI with retry option

---

## 📱 Responsive Design

### Desktop
- Sidebar always visible
- Wide viewport for image display

### Mobile (< 768px)
- Sidebar hides by default
- Click **[MENU]** button to open
- Backdrop dismisses sidebar on click
- Full-screen viewport

---

## 🐛 Troubleshooting

### Frontend won't start
```bash
# Clear Next.js cache
rm -rf .next
npm run build
npm run dev
```

### Backend API not responding
- Ensure backend server is running on port 3088
- Check `.env` file has correct `COMFY_HOST=127.0.0.1:8188`
- Verify Z-Image-Turbo is running on port 8188

### "Module not found" errors
```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

### TypeScript errors
```bash
# Regenerate types
rm tsconfig.json
npx next build
```

---

## 🔧 Configuration

### Environment Variables
Create a `.env` file in the root directory:
```env
# Backend server port
PORT=3088

# Z-Image-Turbo backend address
COMFY_HOST=127.0.0.1:8188
```

### Next.js Port
The Next.js dev server runs on port **3000** by default.
To change: `next dev -p PORT_NUMBER`

### Backend Port
The Express backend runs on port **3088** by default.
Change in `.env` file: `PORT=3088`

---

## 🎯 Key Improvements from Original

✅ **State Management**: Zustand store (no prop drilling)
✅ **Type Safety**: Full TypeScript coverage
✅ **Error Handling**: Error boundaries + error states
✅ **Memory Leaks**: EventSource cleanup
✅ **Code Quality**: Modular components
✅ **UI/UX**: Retro terminal aesthetic
✅ **Responsive**: Mobile-friendly

---

## 📂 Project Structure

```
UI/
├── app/                    # Next.js pages
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   ├── error.tsx          # Error boundary
│   └── loading.tsx        # Loading state
├── components/            # React components
│   ├── ScanlineEffect.tsx
│   ├── TerminalWindow.tsx
│   ├── CommandPrompt.tsx
│   ├── TerminalSidebar.tsx
│   └── TerminalViewport.tsx
├── lib/
│   └── store.ts          # Zustand state
├── types/
│   └── index.ts          # TypeScript types
├── styles/
│   └── globals.css       # Terminal theme
└── server.mjs            # Express backend
```

---

## 🎨 Customizing the Theme

### Color Schemes
Edit `styles/globals.css` to switch themes:

**Green Terminal (Default):**
```css
--terminal-text: #00ff00;
--terminal-text-dim: #00aa00;
```

**Amber Terminal:**
```css
--terminal-text: #ffb000;
--terminal-text-dim: #cc8800;
```

**Blue Terminal:**
```css
--terminal-text: #00ffff;
--terminal-text-dim: #00aaaa;
```

### Scanline Intensity
Adjust in `styles/globals.css`:
```css
--scanline-opacity: 0.05;  /* Subtle */
--scanline-opacity: 0.15;  /* Strong */
```

---

## 🚀 Next Steps

1. **Start the backend**: `npm run server`
2. **Start the frontend**: `npm run dev`
3. **Open browser**: http://localhost:3000
4. **Generate your first image!**

Enjoy your retro terminal AI image generator! 🎮✨
