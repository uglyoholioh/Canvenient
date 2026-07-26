import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
      '/telegram': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
