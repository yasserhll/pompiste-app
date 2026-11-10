import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config'

// Icône Android « maskable » et icône iPhone : goutte sur fond marine plein (sans bord blanc).
// Usage : npx @vite-pwa/assets-generator@0.2.6   (les autres icônes viennent de public/icon.svg)
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: { sizes: [], favicons: [] },
    maskable: { ...preset.maskable, padding: 0.32, resizeOptions: { background: '#0b1220' } },
    apple: { ...preset.apple, padding: 0.3, resizeOptions: { background: '#0b1220' } },
  },
  images: ['pwa-assets/icon-full.svg'],
})
