// IndexedDB on this device: the write queue, small bookkeeping values, and the cached copy of the last loaded data (so the app opens offline).
// Falls back to memory when IndexedDB is missing or blocked, so nothing breaks (it just won't survive a restart).

import { memoryStore, type QItem, type QueueStore } from '../lib/syncQueue'

const DB_NAME = 'taskflow-offline'
const VERSION = 1

let opened: Promise<IDBDatabase | null> | null = null
export function openDb(): Promise<IDBDatabase | null> {
  if (opened) return opened
  opened = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains('queue')) d.createObjectStore('queue', { keyPath: 'seq' })
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'key' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
  return opened
}
/** Tests: forget the opened connection so a fresh fake database is used. */
export function resetOfflineDb() { void opened?.then((d) => d?.close()); opened = null; memKv.clear() }

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDb().then((d) => new Promise<T | undefined>((resolve) => {
    if (!d) { resolve(undefined); return }
    try {
      const req = fn(d.transaction(store, mode).objectStore(store))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(undefined)
    } catch { resolve(undefined) }
  }))
}

const mem = memoryStore()
export const queueStore: QueueStore = {
  async all() {
    if (!(await openDb())) return mem.all()
    return ((await tx<QItem[]>('queue', 'readonly', (s) => s.getAll())) ?? [])
  },
  async put(item) {
    if (!(await openDb())) return mem.put(item)
    await tx('queue', 'readwrite', (s) => s.put(item))
  },
  async remove(seq) {
    if (!(await openDb())) return mem.remove(seq)
    await tx('queue', 'readwrite', (s) => s.delete(seq))
  },
}

const memKv = new Map<string, unknown>()
export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (!(await openDb())) return memKv.get(key) as T | undefined
  const row = await tx<{ key: string; value: T }>('kv', 'readonly', (s) => s.get(key))
  return row?.value
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  if (!(await openDb())) { memKv.set(key, value); return }
  await tx('kv', 'readwrite', (s) => s.put({ key, value }))
}
export async function kvDelete(key: string): Promise<void> {
  if (!(await openDb())) { memKv.delete(key); return }
  await tx('kv', 'readwrite', (s) => s.delete(key))
}

// ───────────── Cached copy of the last loaded data ─────────────
export const cacheGet = <T,>(name: string) => kvGet<T>(`cache:${name}`)
export const cacheSet = (name: string, value: unknown) => kvSet(`cache:${name}`, value)
