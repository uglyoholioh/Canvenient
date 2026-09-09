import { cpSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const frontendRoot = dirname(fileURLToPath(import.meta.url))

// pdf.js loads its WASM image decoders (JPEG2000/JBIG2) and standard fonts by
// appending fixed filenames to a directory URL, so copy them into public/
// (unhashed) for both the dev server and the packaged build. pdfjs-dist is
// always installed here before vite runs, so this is synchronous and cheap.
function copyPdfjsAssets() {
  const pdfjsRoot = resolve(frontendRoot, 'node_modules/pdfjs-dist')
  const destRoot = resolve(frontendRoot, 'public/pdfjs')
  try {
    cpSync(resolve(pdfjsRoot, 'wasm'), resolve(destRoot, 'wasm'), { recursive: true })
    cpSync(resolve(pdfjsRoot, 'standard_fonts'), resolve(destRoot, 'standard_fonts'), { recursive: true })
  } catch (error) {
    console.warn('[vite] Could not copy pdf.js assets:', error?.message)
  }
}
copyPdfjsAssets()

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
  server: {
    proxy: {
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/categories': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/academic-modules': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/tasks': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/canvas': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/schedule': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/events': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ai': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/communities': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/groups': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/invites': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/forms': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/notifications': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/study-sessions': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/notes': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/folders': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/telegram': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/campus-bus': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
