// A small in-memory stand-in for the Supabase tables the offline queue writes to. It follows the real semantics that matter for replay:
// upsert on id (optionally ignoring duplicates), update/delete by column, `updated_at` bumped on every write, and a switch for "network down".
type Row = Record<string, unknown> & { id: string }

export function fakeServer() {
  const tables = new Map<string, Map<string, Row>>()
  let clock = Date.parse('2026-11-10T12:00:00Z')
  const state = { down: false, writes: [] as string[], failWith: null as null | { code?: string; message: string } }
  const t = (name: string) => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name)! }
  const stamp = () => new Date((clock += 1000)).toISOString()
  const net = () => (state.down ? { data: null, error: { message: 'TypeError: Failed to fetch' } } : state.failWith ? { data: null, error: state.failWith } : null)

  function from(name: string) {
    const rows = t(name)
    const q = (run: () => { data: unknown; error: unknown }) => {
      const b = { select: () => b, then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(net() ?? run()).then(ok, bad) }
      return b
    }
    return {
      select: () => ({
        eq: (_c: string, id: string) => ({ maybeSingle: () => Promise.resolve(net() ?? { data: rows.get(id) ? { updated_at: rows.get(id)!.updated_at } : null, error: null }) }),
      }),
      upsert: (input: Row | Row[], opts: { ignoreDuplicates?: boolean } = {}) => q(() => {
        const out: { updated_at: unknown }[] = []
        for (const r of Array.isArray(input) ? input : [input]) {
          const have = rows.get(r.id)
          state.writes.push(`upsert ${name} ${r.id}`)
          if (have && opts.ignoreDuplicates) continue
          const next = { ...(have ?? {}), ...r, updated_at: stamp() } as Row
          rows.set(r.id, next)
          out.push({ updated_at: next.updated_at })
        }
        return { data: out, error: null }
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: (col: string, val: string) => q(() => {
          const out: { updated_at: unknown }[] = []
          for (const [id, r] of rows) if ((col === 'id' ? id : r[col]) === val) { rows.set(id, { ...r, ...patch, updated_at: stamp() }); out.push({ updated_at: rows.get(id)!.updated_at }) }
          state.writes.push(`update ${name} ${val}`)
          return { data: out, error: null }
        }),
      }),
      delete: () => ({
        eq: (col: string, val: string) => q(() => {
          for (const [id, r] of [...rows]) if ((col === 'id' ? id : r[col]) === val) rows.delete(id)
          state.writes.push(`delete ${name} ${val}`)
          return { data: null, error: null }
        }),
      }),
    }
  }
  const client = {
    from,
    rpc: (fn: string, a: Record<string, unknown>) => Promise.resolve(net() ?? (() => {
      if (fn === 'taskflow_log_activity') {
        const s = t('taskflow_sessions')
        if (!s.has(a.p_id as string)) { s.set(a.p_id as string, { id: a.p_id as string, preset_id: a.p_preset, ended_at: a.p_ended_at, updated_at: stamp() }); t('taskflow_session_segments').set(a.p_id as string, { id: a.p_id as string, session_id: a.p_id }) }
        state.writes.push(`rpc ${fn} ${a.p_id}`)
      }
      return { data: null, error: null }
    })()),
  }
  return {
    client: client as never,
    state,
    table: (name: string) => [...t(name).values()],
    /** Another device writes a row right now (its updated_at is the fake clock's next tick). */
    elsewhere: (name: string, row: Row, at?: string) => { t(name).set(row.id, { ...(t(name).get(row.id) ?? {}), ...row, updated_at: at ?? stamp() }) },
    seed: (name: string, row: Row, updatedAt: string) => { t(name).set(row.id, { ...row, updated_at: updatedAt }) },
  }
}
