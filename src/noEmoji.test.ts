import { describe, expect, it } from 'vitest'

// Revision 4: no emoji anywhere in the UI, seed or tests. Text symbols such as ✓ ✕ ▲ ▼ ▾ ⚑ are fine; only emoji-presentation characters are refused.
const EMOJI = /\p{Emoji_Presentation}|️|‍/u
const sources = import.meta.glob('./**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('no emoji', () => {
  it('appears in any source or test file', () => {
    const files = Object.keys(sources).filter((f) => !f.endsWith('noEmoji.test.ts'))
    expect(files.length).toBeGreaterThan(50) // the glob really found the code
    expect(files.filter((f) => EMOJI.test(sources[f]))).toEqual([])
  })
})
