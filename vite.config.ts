/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { manifest } from './src/pwa/manifest'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt": a new version waits until the user taps Reload (see UpdateBanner), so it never swaps in mid-edit.
      registerType: 'prompt',
      injectRegister: false,
      manifest,
      includeAssets: ['apple-touch-icon.png', 'robots.txt'],
      // The service worker caches the app shell only. Nothing from Supabase is ever cached: TaskFlow is online-first until phase 3.5.
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/robots\.txt$/, /^\/sw\.js$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5175, strictPort: true, host: true },
  preview: { port: 5175, strictPort: true, host: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
})
