/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev`        → http://localhost:5173 (PC)
// `npm run dev:https`  → https://<ip-du-pc>:5173 : nécessaire pour la caméra sur téléphone
// Les appels /api sont relayés vers Laravel (pas de CORS en développement).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const https = env.DEV_HTTPS === '1'
  return {
    plugins: [react(), ...(https ? [basicSsl()] : [])],
    server: {
      host: https ? true : 'localhost',
      port: 5173,
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true },
      },
    },
    test: { environment: 'node' },
  }
})
