import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: false,
  },
  server: {
    port: 5174,
    allowedHosts: ['umrgen.share.zrok.io'],
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
