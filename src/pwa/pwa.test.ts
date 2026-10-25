import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import robots from '../../public/robots.txt?raw'
import vercel from '../../vercel.json'
import { manifest } from './manifest'
import { urlToRecord } from './publicUrl'

describe('web app manifest', () => {
  it('is a standalone app named TaskFlow with the dark theme colour', () => {
    expect(manifest).toMatchObject({ name: 'TaskFlow', display: 'standalone', start_url: '/', theme_color: '#0f172a', background_color: '#0f172a' })
  })
  it('has 192 and 512 icons plus a maskable one', () => {
    const by = (size: string, purpose: string) => manifest.icons.some((i) => i.sizes === size && i.purpose === purpose && i.type === 'image/png')
    expect(by('192x192', 'any')).toBe(true)
    expect(by('512x512', 'any')).toBe(true)
    expect(by('512x512', 'maskable')).toBe(true)
  })
  it('offers the /capture shortcut', () => {
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/capture'])
  })
})

describe('index.html', () => {
  it('keeps the app out of search engines and sets the iPhone home-screen tags', () => {
    expect(indexHtml).toContain('<meta name="robots" content="noindex, nofollow" />')
    expect(indexHtml).toContain('rel="apple-touch-icon"')
    expect(indexHtml).toContain('name="apple-mobile-web-app-capable" content="yes"')
    expect(indexHtml).toContain('viewport-fit=cover')
  })
})

describe('robots.txt', () => {
  it('disallows everything', () => {
    expect(robots).toMatch(/User-agent: \*\s+Disallow: \/\s*$/)
  })
})

describe('vercel.json', () => {
  const rewrite = new RegExp(`^${vercel.rewrites[0].source}$`)
  it('sends app routes to index.html but leaves assets and files alone', () => {
    for (const path of ['/', '/tasks', '/capture', '/insights', '/settings']) expect(rewrite.test(path), path).toBe(true)
    for (const path of ['/assets/index-abc.js', '/sw.js', '/manifest.webmanifest', '/robots.txt', '/pwa-192.png']) expect(rewrite.test(path), path).toBe(false)
    expect(vercel.rewrites[0].destination).toBe('/index.html')
  })
  const headers = (source: string) => Object.fromEntries((vercel.headers.find((h) => h.source === source)?.headers ?? []).map((h) => [h.key, h.value]))
  it('sends noindex and the basic security headers on every response', () => {
    expect(headers('/(.*)')).toMatchObject({ 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' })
  })
  it('never lets the service worker or the shell be cached stale, and caches hashed assets for good', () => {
    expect(headers('/sw.js')['Cache-Control']).toMatch(/no-cache/)
    expect(headers('/index.html')['Cache-Control']).toMatch(/no-cache/)
    expect(headers('/assets/(.*)')['Cache-Control']).toMatch(/immutable/)
  })
  it('adds no Content-Security-Policy (a wrong one would silently break Supabase)', () => {
    expect(JSON.stringify(vercel)).not.toMatch(/Content-Security-Policy/i)
  })
  it('still lets the app use the camera later (phase 12 photo reading)', () => {
    expect(headers('/(.*)')['Permissions-Policy']).toMatch(/camera=\(self\)/)
  })
})

describe('urlToRecord (taskflow_settings.taskflow_url)', () => {
  const prod = 'https://taskflow.jarvisjr.daivik.dev'
  it('records the production origin once', () => {
    expect(urlToRecord(prod, null)).toBe(prod)
    expect(urlToRecord(prod, '')).toBe(prod)
    expect(urlToRecord(prod, 'https://old.example.com')).toBe(prod)
    expect(urlToRecord(prod, prod)).toBeNull()
    expect(urlToRecord(prod, `${prod}/`)).toBeNull()
  })
  it('never records localhost, a LAN address, plain http or a Vercel preview URL', () => {
    for (const o of ['http://localhost:5175', 'https://localhost', 'http://192.168.1.20:5175', 'http://10.0.0.5:5175', 'https://172.16.0.4', 'http://taskflow.jarvisjr.daivik.dev', 'https://taskflow-git-main-daivik.vercel.app', 'not a url'])
      expect(urlToRecord(o, null), o).toBeNull()
  })
})
