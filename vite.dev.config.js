import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Dev UI configuration - runs on separate port for feature testing
export default defineConfig({
  plugins: [react()],
  define: {
    __DEV_UI__: 'true'
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  publicDir: false,
  build: {
    outDir: 'public-dev',
    emptyOutDir: true,
  },
  server: {
    port: 5175,
    strictPort: false,
    allowedHosts: ['umrgen.share.zrok.io', 'umrgen-dev.share.zrok.io'],
    proxy: {
      '/api': {
        target: 'http://localhost:3088',
        changeOrigin: true,
        secure: false,
      },
      '/outputs': {
        target: 'http://localhost:3088',
        changeOrigin: true,
        secure: false,
      },
      '/references': {
        target: 'http://localhost:3088',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
