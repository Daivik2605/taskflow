import type { SupabaseClient } from '@supabase/supabase-js'
import { COUNTER_SEEDS, JOB_SEEDS, PRESET_SEEDS, PROJECT_SEED, TAG_SEEDS, buildActions } from './seed'

export interface TagRow { name: string; kind: string; color: string; show_for_tasks: boolean; sort: number; app_key: string | null; parent_id: string | null }

/** The few operations seeding needs. Kept small so the "exactly once" logic is testable without Supabase. */
export interface SeedDb {
  isSeeded(): Promise<boolean>
  ensureSettings(): Promise<void>
  /** Insert-if-missing by (parent, name); returns every tag the user has. */
  upsertTags(rows: TagRow[]): Promise<{ id: string; name: string; parent_id: string | null }[]>
  upsertPresets(rows: { name: string; area_id: string; default_minutes: number; sort: number }[]): Promise<{ id: string; name: string }[]>
  upsertProject(row: { name: string; area_id: string; status: string }): Promise<void>
  upsertJobs(rows: { employer: string; area_id: string }[]): Promise<{ id: string; employer: string }[]>
  upsertCounters(rows: { name: string; short_label: string; color: string; sort: number }[]): Promise<void>
  upsertActions(rows: { key: string; label: string; sort: number }[]): Promise<void>
  markSeeded(): Promise<void>
}

/**
 * Safe to call any number of times, from any number of devices at once: every insert is an upsert on a unique key that
 * ignores duplicates, and `seeded_at` is set last — so an interrupted seed just finishes next time. Returns true if it ran.
 */
export async function runSeed(db: SeedDb): Promise<boolean> {
  if (await db.isSeeded()) return false
  await db.ensureSettings()

  const parents = await db.upsertTags(TAG_SEEDS.map((t, i) => ({
    name: t.name, kind: t.kind, color: t.color, show_for_tasks: t.show_for_tasks, sort: i, app_key: null, parent_id: null })))
  const parentId = (name: string) => {
    const p = parents.find((x) => x.name === name && x.parent_id === null)
    if (!p) throw new Error(`Seed tag missing: ${name}`)
    return p.id
  }
  const all = await db.upsertTags(TAG_SEEDS.flatMap((t) => t.children.map((c, i) => ({
    name: c.name, kind: t.kind, color: c.color, show_for_tasks: c.show_for_tasks, sort: i, app_key: c.app_key, parent_id: parentId(t.name) }))))
  const tagId = (path: string) => {
    const [parent, name] = path.split('/')
    const pid = parentId(parent)
    const t = all.find((x) => x.name === name && x.parent_id === pid)
    if (!t) throw new Error(`Seed tag missing: ${path}`)
    return t.id
  }

  const presets = await db.upsertPresets(PRESET_SEEDS.map((p, i) => ({ name: p.name, area_id: tagId(p.tag), default_minutes: p.default_minutes, sort: i })))
  await db.upsertProject({ name: PROJECT_SEED.name, area_id: tagId(PROJECT_SEED.tag), status: PROJECT_SEED.status })
  const jobs = await db.upsertJobs(JOB_SEEDS.map((j) => ({ employer: j.employer, area_id: tagId(j.tag) })))
  await db.upsertCounters(COUNTER_SEEDS.map((c, i) => ({ ...c, sort: i })))
  const ordered = JOB_SEEDS.map((s) => jobs.find((j) => j.employer === s.employer)!)
  await db.upsertActions(buildActions(ordered, presets).map((a, i) => ({ ...a, sort: i })))

  await db.markSeeded()
  return true
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export function supabaseSeedDb(client: SupabaseClient, userId: string): SeedDb {
  const up = (table: string, rows: object[], onConflict: string) =>
    client.from(table).upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: `user_id,${onConflict}`, ignoreDuplicates: true })

  return {
    async isSeeded() {
      const row = must<{ seeded_at: string | null } | null>(await client.from('taskflow_settings').select('seeded_at').eq('user_id', userId).maybeSingle())
      return !!row?.seeded_at
    },
    async ensureSettings() {
      must(await client.from('taskflow_settings').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true }))
    },
    async upsertTags(rows) {
      if (rows.length > 0) must(await up('taskflow_areas', rows, 'parent_id,name'))
      return must(await client.from('taskflow_areas').select('id,name,parent_id').eq('user_id', userId))
    },
    async upsertPresets(rows) {
      must(await up('taskflow_presets', rows, 'name'))
      return must(await client.from('taskflow_presets').select('id,name').eq('user_id', userId))
    },
    async upsertProject(row) {
      must(await up('taskflow_projects', [row], 'name'))
    },
    async upsertJobs(rows) {
      must(await up('taskflow_jobs', rows, 'employer'))
      return must(await client.from('taskflow_jobs').select('id,employer').eq('user_id', userId))
    },
    async upsertCounters(rows) {
      must(await up('taskflow_counters', rows, 'name'))
    },
    async upsertActions(rows) {
      must(await up('taskflow_actions', rows, 'key'))
    },
    async markSeeded() {
      must(await client.from('taskflow_settings').update({ seeded_at: new Date().toISOString() }).eq('user_id', userId).is('seeded_at', null))
    },
  }
}
