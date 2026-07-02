import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    inspectAttr(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['megy-character.png'],
      manifest: {
        name: 'Megy Prints',
        short_name: 'Megy Prints',
        description: 'AI photo-album builder — Megy designs your album, you just approve.',
        theme_color: '#F4C2A1',
        background_color: '#FFF8F0',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        icons: [
          { src: 'megy-character.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'megy-character.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Main bundle is ~3MB; raise the precache limit so it works offline.
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Apply a shipped build on the NEXT load instead of waiting for every tab
        // to close — the new service worker activates immediately and claims open
        // clients. Old precaches are pruned so they can't be served stale.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // App shell = network-first: when online, always fetch the latest HTML so
        // new asset hashes load right away; fall back to cache only when offline.
        runtimeCaching: [
          {
            // App-shell navigations only. CRUCIAL: exclude server-rendered routes
            // (/m/:code QR resolver + /api/*) — the SPA uses HashRouter, so those
            // real paths have NO client route; if the SW served the app shell for
            // them the page rendered BLANK. These must always go to the network.
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' &&
              !url.pathname.startsWith('/m/') &&
              !url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 8 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: Number(process.env.PORT) || 3000,
  },
  optimizeDeps: {
    include: ['fabric'],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
