/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'

// `npm run dev`        → http://localhost:5173 (PC)
// `npm run dev:https`  → https://<ip-du-pc>:5173 : nécessaire pour la caméra et l'installation sur téléphone
// Les appels /api sont relayés vers Laravel (pas de CORS en développement).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const https = env.DEV_HTTPS === '1'
  const proxy = { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true } }

  return {
    plugins: [
      react(),
      ...(https ? [basicSsl()] : []),
      VitePWA({
        // « prompt » : l'utilisateur choisit quand recharger (jamais pendant une saisie)
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Pompiste — Gestion du gasoil',
          short_name: 'Pompiste',
          description: 'Ravitaillement des véhicules par scan QR, suivi des citernes et rapports de consommation.',
          lang: 'fr',
          dir: 'ltr',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui'],
          orientation: 'any',
          theme_color: '#0b1220',
          background_color: '#0b1220',
          categories: ['business', 'productivity', 'utilities'],
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Scanner un véhicule', short_name: 'Scanner', url: '/ravitaillement', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
            { name: 'Historique des bons', short_name: 'Historique', url: '/bons', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
            // Données métier : toujours le serveur, jamais de cache (stock, bons, contrôles)
            { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
            {
              urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'polices', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    server: { host: https ? true : 'localhost', port: 5173, proxy },
    preview: { host: https ? true : 'localhost', port: 4190, proxy }, // 4173 est souvent déjà pris par d'autres projets
    test: { environment: 'node' },
  }
})
