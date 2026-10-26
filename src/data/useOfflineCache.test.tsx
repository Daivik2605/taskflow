import 'fake-indexeddb/auto'
import { act, render, screen, waitFor } from '@testing-library/react'
import { useRef, useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { cacheGet, cacheSet, resetOfflineDb } from './offlineStore'
import { useOfflineCache } from './useOfflineCache'

// A tiny provider shaped like the real ones: loading until the server answers, hydrated from the cache first.
function Screen({ serverAnswers }: { serverAnswers: string[] | null }) {
  const [items, setItems] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const loaded = useRef(false)
  useOfflineCache('demo', items, !loading, (saved) => { setItems(saved); setLoading(false) }, () => loaded.current)
  const answered = useRef(false)
  if (serverAnswers && !answered.current) { answered.current = true; queueMicrotask(() => { loaded.current = true; setItems(serverAnswers); setLoading(false) }) }
  return <p data-testid="v">{loading ? 'loading' : items.join(',') || 'empty'}</p>
}

beforeEach(async () => {
  await new Promise<void>((r) => { const d = indexedDB.deleteDatabase('taskflow-offline'); d.onsuccess = () => r(); d.onerror = () => r(); d.onblocked = () => r() })
  resetOfflineDb()
})

describe('useOfflineCache', () => {
  it('opens offline: with the server unreachable the last saved data is shown', async () => {
    await cacheSet('demo', ['task A', 'task B'])
    render(<Screen serverAnswers={null} />)
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('task A,task B'))
  })
  it('saves what the server returned so the next offline start has it', async () => {
    render(<Screen serverAnswers={['fresh']} />)
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('fresh'))
    await act(async () => { await new Promise((r) => setTimeout(r, 500)) })
    expect(await cacheGet('demo')).toEqual(['fresh'])
  })
  it('the real answer wins over an older saved copy', async () => {
    await cacheSet('demo', ['stale'])
    render(<Screen serverAnswers={['fresh']} />)
    await waitFor(() => expect(screen.getByTestId('v')).toHaveTextContent('fresh'))
    expect(screen.getByTestId('v')).not.toHaveTextContent('stale')
  })
})
