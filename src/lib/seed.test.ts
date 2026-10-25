import { describe, expect, it } from 'vitest'
import expected from '../../supabase/tests/expected-tree.json'
import { TAG_KINDS } from './areas'
import { COUNTER_SEEDS, JOB_SEEDS, PRESET_SEEDS, PROJECT_SEED, TAG_SEEDS, buildActions } from './seed'
import { runSeed, type SeedDb, type TagRow } from './seedRunner'

describe('seed data', () => {
  it('equals the tree the SQL migration produces (shared fixture with supabase/tests)', () => {
    const tree = TAG_SEEDS.map((t) => ({ name: t.name, kind: t.kind, show_for_tasks: t.show_for_tasks, children: t.children.map((c) => ({ name: c.name, app_key: c.app_key, show_for_tasks: c.show_for_tasks })) }))
    expect(tree).toEqual(expected.tree)
    expect(PRESET_SEEDS.map((p) => ({ name: p.name, tag: p.tag, default_minutes: p.default_minutes }))).toEqual(expected.presets)
    expect(JOB_SEEDS).toEqual(expected.jobs)
    expect(COUNTER_SEEDS.map((c) => ({ name: c.name, short_label: c.short_label }))).toEqual(expected.counters)
    expect(PROJECT_SEED).toMatchObject(expected.project)
  })
  it('has seven parents with valid, distinct kinds and unique names per parent', () => {
    expect(TAG_SEEDS).toHaveLength(7)
    expect(TAG_SEEDS.map((t) => t.kind).sort()).toEqual(TAG_KINDS.map((k) => k.value).sort())
    for (const t of TAG_SEEDS) expect(new Set(t.children.map((c) => c.name)).size).toBe(t.children.length)
  })
  it('links DSA and Trading to their apps and nothing else', () => {
    const linked = TAG_SEEDS.flatMap((t) => t.children).filter((c) => c.app_key).map((c) => [c.name, c.app_key])
    expect(linked).toEqual([['DSA', 'dsa'], ['Trading', 'trading']])
  })
  it('points presets, the project and jobs at real sub-tags', () => {
    const paths = new Set(TAG_SEEDS.flatMap((t) => t.children.map((c) => `${t.name}/${c.name}`)))
    for (const p of PRESET_SEEDS) expect(paths).toContain(p.tag)
    expect(paths).toContain(PROJECT_SEED.tag)
    for (const j of JOB_SEEDS) expect(paths).toContain(j.tag)
    expect(PRESET_SEEDS.map((p) => [p.name, p.default_minutes])).toEqual([['Kriya', 35], ['Padmasadna', 20], ['Home Workout', 30], ['Gym', 60]])
  })
  it('builds the default actions with unique keys, one shift per job', () => {
    const a = buildActions([{ id: 'j1', employer: 'Tim Hortons' }, { id: 'j2', employer: 'Oland Stations' }], [{ id: 'p1', name: 'Kriya' }, { id: 'p2', name: 'Padmasadna' }, { id: 'p3', name: 'Home Workout' }, { id: 'p4', name: 'Gym' }])
    expect(a.map((x) => x.key)).toEqual(['shift:j1', 'shift:j2', 'nap_reset', 'preset:p1', 'preset:p2', 'preset:p3', 'preset:p4', 'sleep_checkin'])
    expect(a.map((x) => x.label)).toEqual(expected.actions)
  })
})

/** In-memory SeedDb with the same unique keys as the schema. */
function fakeDb() {
  const state = {
    seeded: false, settings: 0, tags: new Map<string, { id: string; name: string; parent_id: string | null }>(), presets: new Map<string, string>(),
    projects: new Set<string>(), jobs: new Map<string, string>(), counters: new Set<string>(), actions: new Set<string>(),
    jobRows: [] as Record<string, unknown>[], tagRows: [] as TagRow[],
  }
  let n = 0
  const id = () => `id${++n}`
  const tick = () => new Promise((r) => setTimeout(r, 0))
  const db: SeedDb = {
    async isSeeded() { await tick(); return state.seeded },
    async ensureSettings() { await tick(); state.settings = 1 },
    async upsertTags(rows) {
      await tick()
      for (const r of rows) {
        state.tagRows.push(r)
        const key = `${r.parent_id}|${r.name}` // NULLS NOT DISTINCT: "null|Work" is one key
        if (!state.tags.has(key)) state.tags.set(key, { id: id(), name: r.name, parent_id: r.parent_id })
      }
      return [...state.tags.values()]
    },
    async upsertPresets(rows) { await tick(); for (const r of rows) if (!state.presets.has(r.name)) state.presets.set(r.name, id()); return [...state.presets].map(([name, i]) => ({ id: i, name })) },
    async upsertProject(row) { await tick(); state.projects.add(row.name) },
    async upsertJobs(rows) { await tick(); for (const r of rows) { state.jobRows.push(r); if (!state.jobs.has(r.employer)) state.jobs.set(r.employer, id()) } return [...state.jobs].map(([employer, i]) => ({ id: i, employer })) },
    async upsertCounters(rows) { await tick(); for (const r of rows) state.counters.add(r.name) },
    async upsertActions(rows) { await tick(); for (const r of rows) state.actions.add(r.key) },
    async markSeeded() { await tick(); state.seeded = true },
  }
  return { db, state }
}

describe('runSeed', () => {
  it('seeds everything once', async () => {
    const { db, state } = fakeDb()
    expect(await runSeed(db)).toBe(true)
    expect([...state.tags.values()].filter((t) => t.parent_id === null)).toHaveLength(7)
    expect([...state.tags.values()].filter((t) => t.parent_id !== null)).toHaveLength(14)
    expect(state.presets.size).toBe(4)
    expect([...state.projects]).toEqual(['AEO Studio'])
    expect(state.jobs.size).toBe(2)
    expect([...state.counters]).toEqual(['Cigarette', 'Weed'])
    expect(state.actions.size).toBe(8)
    expect(state.settings).toBe(1)
    expect(state.seeded).toBe(true)
  })
  it('creates parents before their sub-tags, and sub-tags carry their parent kind', async () => {
    const { db, state } = fakeDb()
    await runSeed(db)
    const first = state.tagRows.findIndex((r) => r.parent_id !== null)
    expect(state.tagRows.slice(0, first).every((r) => r.parent_id === null)).toBe(true)
    const study = [...state.tags.values()].find((t) => t.name === 'Study')!
    expect(state.tagRows.filter((r) => r.parent_id === study.id).every((r) => r.kind === 'study')).toBe(true)
  })
  it('does not seed pay rate or anchor', async () => {
    const { db, state } = fakeDb()
    await runSeed(db)
    for (const row of state.jobRows) {
      expect(row).not.toHaveProperty('hourly_rate')
      expect(row).not.toHaveProperty('pay_period_anchor')
    }
  })
  it('does nothing the second time', async () => {
    const { db, state } = fakeDb()
    await runSeed(db)
    expect(await runSeed(db)).toBe(false)
    expect(state.tags.size).toBe(21)
    expect(state.actions.size).toBe(8)
  })
  it('two simultaneous runs (two devices / StrictMode) still leave one copy', async () => {
    const { db, state } = fakeDb()
    await Promise.all([runSeed(db), runSeed(db)])
    expect(state.tags.size).toBe(21)
    expect(state.presets.size).toBe(4)
    expect(state.jobs.size).toBe(2)
    expect(state.actions.size).toBe(8)
    expect(state.counters.size).toBe(2)
  })
  it('an interrupted seed finishes on the next run without duplicating', async () => {
    const { db, state } = fakeDb()
    const failing: SeedDb = { ...db, upsertActions: async () => { throw new Error('network') } }
    await expect(runSeed(failing)).rejects.toThrow('network')
    expect(state.seeded).toBe(false)
    expect(await runSeed(db)).toBe(true)
    expect(state.tags.size).toBe(21)
    expect(state.jobs.size).toBe(2)
    expect(state.actions.size).toBe(8)
  })
})

describe('revision 4 seed rules', () => {
  it('offers exactly the six task tags (Study, Oland Stations, Commute, AEO Studio, Projects, Trading)', () => {
    const flagged = TAG_SEEDS.flatMap((t) => [t.show_for_tasks ? t.name : null, ...t.children.map((c) => (c.show_for_tasks ? c.name : null))]).filter(Boolean)
    expect(flagged.sort()).toEqual(['AEO Studio', 'Commute', 'Oland Stations', 'Projects', 'Study', 'Trading'])
  })
  it('puts Projects under Hustle', () => {
    expect(TAG_SEEDS.find((t) => t.name === 'Hustle')!.children.map((c) => c.name)).toEqual(['AEO Studio', 'Projects'])
  })
  it('has no emoji anywhere in the seed', () => {
    expect(JSON.stringify([TAG_SEEDS, COUNTER_SEEDS, PRESET_SEEDS])).not.toMatch(/\p{Extended_Pictographic}/u)
  })
  it('gives the counters short labels for the header pills', () => {
    expect(COUNTER_SEEDS.map((c) => c.short_label)).toEqual(['Cig', 'Weed'])
  })
})
