// The web app manifest, shared by vite.config.ts (which emits it) and the tests (which check it).
export const THEME_COLOR = '#0f172a'

export const manifest = {
  name: 'TaskFlow',
  short_name: 'TaskFlow',
  description: 'Tasks, timer, counters and goals — part of PersonalOS.',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone' as const,
  orientation: 'any' as const,
  background_color: THEME_COLOR,
  theme_color: THEME_COLOR,
  icons: [
    { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' as const },
    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' as const },
    { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' as const },
  ],
  // Long-press the home-screen icon (Android, desktop): jump straight to the capture box.
  shortcuts: [{ name: 'Quick capture', short_name: 'Capture', url: '/capture', icons: [{ src: 'pwa-192.png', sizes: '192x192', type: 'image/png' }] }],
}
