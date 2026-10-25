// Draws the TaskFlow app icons (an indigo tile with a white check mark) into public/ — no dependencies, just zlib.
// Run `node scripts/make-icons.mjs` only to change the icon; the PNGs are committed.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(out, { recursive: true })

const BG = [15, 23, 42] // slate-900, the theme colour
const TILE = [79, 70, 229] // indigo-600
const FG = [255, 255, 255]

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const distToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** `scale` = how much of the canvas the check occupies; `rounded` = a rounded tile on transparent corners; otherwise full-bleed. */
function icon(size, { scale, rounded, tile = true }) {
  const buf = Buffer.alloc(size * size * 4)
  const SS = 3 // supersampling
  const radius = size * 0.22
  const u = size * scale
  const c = size / 2
  // the check, in canvas coordinates
  const a = [c - 0.30 * u, c + 0.02 * u], b = [c - 0.08 * u, c + 0.24 * u], d = [c + 0.32 * u, c - 0.22 * u]
  const half = 0.075 * u
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, bl = 0, al = 0
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS
      let col = null
      const inTile = !rounded || (() => {
        const qx = Math.max(Math.abs(px - c) - (c - radius), 0), qy = Math.max(Math.abs(py - c) - (c - radius), 0)
        return Math.hypot(qx, qy) <= radius
      })()
      if (inTile) col = tile ? TILE : BG
      if (inTile && Math.min(distToSegment(px, py, ...a, ...b), distToSegment(px, py, ...b, ...d)) <= half) col = FG
      if (col) { r += col[0]; g += col[1]; bl += col[2]; al += 255 }
    }
    const n = SS * SS, i = (y * size + x) * 4
    const cover = al / (255 * n)
    buf[i] = cover ? Math.round(r / (cover * n)) : 0; buf[i + 1] = cover ? Math.round(g / (cover * n)) : 0; buf[i + 2] = cover ? Math.round(bl / (cover * n)) : 0
    buf[i + 3] = Math.round(cover * 255)
  }
  return png(size, buf)
}

const files = {
  'pwa-192.png': icon(192, { scale: 0.8, rounded: true }),
  'pwa-512.png': icon(512, { scale: 0.8, rounded: true }),
  'pwa-maskable-512.png': icon(512, { scale: 0.55, rounded: false }), // check stays inside the 80% safe zone
  'apple-touch-icon.png': icon(180, { scale: 0.8, rounded: false }), // iOS rounds the corners itself
}
for (const [name, data] of Object.entries(files)) { writeFileSync(join(out, name), data); console.log(`wrote public/${name} (${data.length} bytes)`) }
