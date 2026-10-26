import { assert, assertEquals, assertNotEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { bearer, endpointOf, handle, matchOne, RATE_LIMIT_PER_MINUTE, sha256Hex, spokenDuration, torontoDay, type Req } from './core.ts'
import { memoryStore } from './memory_store.ts'

const A = 'user-a', B = 'user-b'
const TOKEN_A = 'tfk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const TOKEN_B = 'tfk_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
const NOW = new Date('2026-11-10T15:00:00Z') // 10:00 Toronto

let n = 0
async function setup() {
  const m = memoryStore(() => NOW)
  await m.addToken(A, TOKEN_A)
  await m.addToken(B, TOKEN_B)
  for (const [uid, p] of [[A, 'a'], [B, 'b']] as const) {
    const d = m.user(uid)
    d.counters.push({ id: `${p}-cig`, name: 'Cigarette', short_label: 'Cig', archived: false }, { id: `${p}-weed`, name: 'Weed', short_label: null, archived: false }, { id: `${p}-old`, name: 'Alcohol', short_label: null, archived: true })
    d.areas.push({ id: `${p}-study`, name: 'Study', parent_id: null, archived: false }, { id: `${p}-dsa`, name: 'DSA', parent_id: `${p}-study`, archived: false }, { id: `${p}-sql`, name: 'SQL', parent_id: `${p}-study`, archived: false }, { id: `${p}-well`, name: 'Wellness', parent_id: null, archived: false })
    d.presets.push({ id: `${p}-kriya`, name: 'Kriya', area_id: `${p}-well`, default_minutes: 35, archived: false }, { id: `${p}-gym`, name: 'Gym', area_id: `${p}-well`, default_minutes: 60, archived: false })
    d.tasks.push({ id: `${p}-t1`, title: 'Finish Week 3', area_id: `${p}-dsa` }, { id: `${p}-t2`, title: 'Untagged chore', area_id: null })
  }
  const deps = { store: m.store, now: () => NOW, id: () => crypto.randomUUID() }
  const call = (endpoint: string, body: unknown = {}, token: string | null = TOKEN_A, extra: Partial<Req> = {}) =>
    handle({ method: 'POST', path: `/functions/v1/taskflow-api/${endpoint}`, headers: token ? { authorization: `Bearer ${token}` } : {}, body, ...extra }, deps)
  return { m, deps, call }
}

Deno.test('hashing matches the browser: sha-256 hex of a known string', async () => {
  assertEquals(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

Deno.test('helpers: endpoint path, bearer header, Toronto day, spoken durations, name matching', () => {
  assertEquals(endpointOf('/functions/v1/taskflow-api/timer/start'), 'timer/start')
  assertEquals(endpointOf('/taskflow-api/counter/'), 'counter')
  assertEquals(bearer({ authorization: `Bearer ${TOKEN_A}` }), TOKEN_A)
  assertEquals(bearer({ 'x-taskflow-token': TOKEN_A }), TOKEN_A)
  assertEquals(bearer({ authorization: 'Bearer not-a-token' }), null)
  assertEquals(bearer({}), null)
  assertEquals(torontoDay(new Date('2026-11-11T03:30:00Z')), '2026-11-10') // 22:30 the evening before
  assertEquals(spokenDuration(80 * 60_000), '1 hour 20 minutes')
  assertEquals(spokenDuration(35 * 60_000), '35 minutes')
  assertEquals(spokenDuration(60 * 60_000), '1 hour')
  assertEquals(spokenDuration(20_000), 'under a minute')
  const items = [{ n: 'Cigarette', s: 'Cig' }, { n: 'Weed', s: '' }]
  const names = (i: { n: string; s: string }) => [i.n, i.s]
  assert(matchOne(items, 'cigarettes', names, 'counter').ok)
  assert(matchOne(items, 'CIG', names, 'counter').ok)
  assert(matchOne(items, 'we', names, 'counter').ok)
  assertEquals(matchOne(items, 'tea', names, 'counter'), { ok: false, say: "I couldn't find a counter called tea." })
  assertStringIncludes((matchOne([{ n: 'DSA' }, { n: 'DSA notes' }].concat([{ n: 'DSAx' }]), 'ds', (i) => [i.n], 'tag') as { say: string }).say, 'More than one tag')
})

Deno.test('auth: a missing, malformed, unknown or revoked token is refused with 401, and nothing is written', async () => {
  const { m, deps, call } = await setup()
  const revoked = await m.addToken(A, 'tfk_REVOKEDREVOKEDREVOKEDREVOKEDREVOKED', true)
  const tries: [string, Promise<{ status: number; body: { say: string } }>][] = [
    ['no header', call('counter', { name: 'cig' }, null)],
    ['malformed', call('counter', { name: 'cig' }, 'hello')],
    ['unknown', call('counter', { name: 'cig' }, 'tfk_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ')],
    ['revoked', call('counter', { name: 'cig' }, revoked)],
  ]
  for (const [label, p] of tries) {
    const r = await p
    assertEquals(r.status, 401, label)
    assertEquals(r.body.say, "That token isn't valid or was revoked.", label)
  }
  assertEquals(m.user(A).events.length, 0)
  assertEquals(m.logs.length, 0)
  void deps
})

Deno.test('auth: revoking a token that worked a moment ago stops it at once', async () => {
  const { m, call } = await setup()
  assertEquals((await call('counter', { name: 'cig' })).status, 200)
  for (const t of m.tokens.values()) if (t.user_id === A) t.revoked_at = '2026-11-10T15:00:01Z'
  assertEquals((await call('counter', { name: 'cig' })).status, 401)
  assertEquals(m.user(A).events.length, 1)
})

Deno.test('auth: the token also works in the x-taskflow-token header; only POST is accepted', async () => {
  const { call } = await setup()
  assertEquals((await call('counter', { name: 'cig' }, null, { headers: { 'x-taskflow-token': TOKEN_A } })).status, 200)
  assertEquals((await call('counter', { name: 'cig' }, TOKEN_A, { method: 'GET' })).status, 405)
})

Deno.test('wrong user: a token acts only on its owner, even when both users have the same names', async () => {
  const { m, call } = await setup()
  const a = await call('counter', { name: 'cigarette' }, TOKEN_A)
  const b1 = await call('counter', { name: 'cigarette' }, TOKEN_B)
  const b2 = await call('counter', { name: 'cigarette' }, TOKEN_B)
  assertEquals(a.body.say, 'Cigarette 1 today')
  assertEquals(b2.body.say, 'Cigarette 2 today')
  assertEquals(b1.body.say, 'Cigarette 1 today')
  assertEquals(m.user(A).events.map((e) => e.counter_id), ['a-cig'])
  assertEquals(m.user(B).events.map((e) => e.counter_id), ['b-cig', 'b-cig'])
  // user B's tag/preset/task names can't be reached by A, and A's timer is A's alone
  await call('timer/start', { tag: 'DSA' }, TOKEN_A)
  assertEquals(m.user(B).sessions.length, 0)
  assertEquals((await call('timer/stop', {}, TOKEN_B)).body.say, 'No timer is running.')
  assertEquals(m.user(A).sessions[0].area_id, 'a-dsa')
  // the log records each action under its own user
  assertEquals(new Set(m.logs.map((l) => l.user_id)), new Set([A, B]))
})

Deno.test('rate limit: the 31st request in a minute gets 429 and writes nothing', async () => {
  const { m, call } = await setup()
  for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) assertEquals((await call('counter', { name: 'weed' })).status, 200)
  const r = await call('counter', { name: 'weed' })
  assertEquals(r.status, 429)
  assertEquals(r.body.say, 'Too many requests. Wait a minute.')
  assertEquals(m.user(A).events.length, RATE_LIMIT_PER_MINUTE)
  assertEquals((await call('counter', { name: 'weed' }, TOKEN_B)).status, 200) // another token has its own allowance
})

Deno.test('counter: counts today, accepts names and short labels, qty and an id for safe repeats', async () => {
  const { m, call } = await setup()
  assertEquals((await call('counter', { name: 'Cig' })).body.say, 'Cigarette 1 today')
  assertEquals((await call('counter', { name: 'weed', qty: 2 })).body.say, 'Weed 2 today')
  const id = crypto.randomUUID()
  assertEquals((await call('counter', { name: 'cigarette', id })).body.say, 'Cigarette 2 today')
  assertEquals((await call('counter', { name: 'cigarette', id })).body.say, 'Cigarette 2 today') // repeated request: no second row
  assertEquals(m.user(A).events.filter((e) => e.counter_id === 'a-cig').length, 2)
  assertEquals((await call('counter', { name: 'alcohol' })).status, 404) // archived counters can't be tapped
  assertEquals((await call('counter', { name: 'tea' })).status, 404)
  assertEquals((await call('counter', {})).status, 400)
  assertEquals((await call('counter', { name: 'cig', qty: 0 })).status, 400)
  assertEquals((await call('counter', { name: 'cig', qty: 1.5 })).status, 400)
  assertEquals((await call('counter', { name: 'cig', id: 'nope' })).status, 400)
})

Deno.test('capture: saves an idea note, first line as the title', async () => {
  const { m, call } = await setup()
  const r = await call('capture', { text: 'Look into vector DBs\nsee the pgvector docs' })
  assertEquals(r.body.say, 'Saved to your inbox')
  assertEquals(m.user(A).notes[0].title, 'Look into vector DBs')
  assertEquals(m.user(A).notes[0].body, 'Look into vector DBs\nsee the pgvector docs')
  await call('capture', { text: 'Call Mom' })
  assertEquals(m.user(A).notes[1], { id: m.user(A).notes[1].id, title: 'Call Mom', body: '' })
  assertEquals((await call('capture', { text: '   ' })).status, 400)
  assertEquals((await call('capture', { text: 'x'.repeat(2001) })).status, 400)
  assertEquals(m.user(B).notes.length, 0)
})

Deno.test('timer/start: by preset, tag or task; refuses a second timer; explains a task with no tag', async () => {
  const { m, call } = await setup()
  const r = await call('timer/start', { tag: 'dsa' })
  assertEquals(r.body.say, 'Timer started on DSA')
  assertEquals(m.user(A).sessions[0].state, 'running')
  assertEquals(m.user(A).sessions[0].segments.length, 1)
  const again = await call('timer/start', { tag: 'sql' })
  assertEquals(again.status, 409)
  assertEquals(again.body.say, 'A timer is already running on DSA. Stop it first.')
  await call('timer/stop')
  assertEquals((await call('timer/start', { preset: 'kriya' })).body.say, 'Timer started on Wellness')
  assertEquals(m.user(A).sessions[1].comment, 'Kriya')
  await call('timer/stop')
  const t = await call('timer/start', { task: 'week 3' })
  assertEquals(t.body.say, 'Timer started on Finish Week 3, DSA')
  assertEquals(m.user(A).sessions[2].task_id, 'a-t1')
  await call('timer/stop')
  const untagged = await call('timer/start', { task: 'chore' })
  assertEquals(untagged.status, 400)
  assertStringIncludes(untagged.body.say, 'no tag')
  assertEquals((await call('timer/start', { task: 'chore', tag: 'study' })).status, 200) // a tag given alongside fixes it
  await call('timer/stop')
  assertEquals((await call('timer/start', {})).status, 400)
  assertEquals((await call('timer/start', { tag: 'nonsense' })).status, 404)
})

Deno.test('timer/stop: closes the open stretch, says how long, keeps the comment', async () => {
  const { m, deps, call } = await setup()
  await call('timer/start', { tag: 'DSA' })
  const later = { ...deps, now: () => new Date(NOW.getTime() + 80 * 60_000) }
  const r = await handle({ method: 'POST', path: '/taskflow-api/timer/stop', headers: { authorization: `Bearer ${TOKEN_A}` }, body: { comment: 'chapter 3 done' } }, later)
  assertEquals(r.body.say, 'Stopped DSA, 1 hour 20 minutes')
  const s = m.user(A).sessions[0]
  assertEquals([s.state, s.comment, s.segments[0].ended_at], ['stopped', 'chapter 3 done', new Date(NOW.getTime() + 80 * 60_000).toISOString()])
  assertEquals((await call('timer/stop')).status, 409)
})

Deno.test('timer/stop: a paused timer only counts the time it ran', async () => {
  const { m, deps, call } = await setup()
  const s = m.user(A)
  s.sessions.push({ id: 'p1', area_id: 'a-dsa', task_id: null, state: 'paused', comment: null, started_at: NOW.toISOString(), source: 'timer', ended_at: null, segments: [{ id: 'g1', started_at: NOW.toISOString(), ended_at: new Date(NOW.getTime() + 30 * 60_000).toISOString() }] })
  const later = { ...deps, now: () => new Date(NOW.getTime() + 300 * 60_000) }
  const r = await handle({ method: 'POST', path: '/taskflow-api/timer/stop', headers: { authorization: `Bearer ${TOKEN_A}` }, body: {} }, later)
  assertEquals(r.body.say, 'Stopped DSA, 30 minutes')
  void call
})

Deno.test('activity/log: default and given minutes, repeat-safe id, validation', async () => {
  const { m, call } = await setup()
  assertEquals((await call('activity/log', { name: 'kriya' })).body.say, 'Kriya logged, 35 minutes')
  const log = m.user(A).sessions[0]
  assertEquals([log.source, log.state, log.area_id, log.ended_at], ['preset', 'stopped', 'a-well', NOW.toISOString()])
  assertEquals(log.started_at, new Date(NOW.getTime() - 35 * 60_000).toISOString())
  assertEquals((await call('activity/log', { name: 'Gym', minutes: 45 })).body.say, 'Gym logged, 45 minutes')
  const id = crypto.randomUUID()
  await call('activity/log', { name: 'gym', id }); await call('activity/log', { name: 'gym', id })
  assertEquals(m.user(A).sessions.length, 3)
  assertEquals((await call('activity/log', { name: 'yoga' })).status, 404)
  assertEquals((await call('activity/log', { name: 'gym', minutes: 0 })).status, 400)
  assertEquals((await call('activity/log', { name: 'gym', minutes: 2000 })).status, 400)
  assertEquals((await call('activity/log', {})).status, 400)
  assertEquals(m.user(B).sessions.length, 0)
})

Deno.test('logging: every call is logged with its endpoint and result; last_used_at is set; errors never leak details', async () => {
  const { m, deps, call } = await setup()
  await call('counter', { name: 'cig' })
  await call('counter', { name: 'tea' })
  await call('nope')
  assertEquals(m.logs.map((l) => [l.endpoint, l.ok]), [['counter', true], ['counter', false], ['nope', false]])
  assertEquals([...m.tokens.values()].find((t) => t.user_id === A)!.last_used_at, NOW.toISOString())
  const broken = { ...deps, store: { ...deps.store, counters: () => Promise.reject(new Error('relation "secret" does not exist')) } }
  const r = await handle({ method: 'POST', path: '/taskflow-api/counter', headers: { authorization: `Bearer ${TOKEN_A}` }, body: { name: 'cig' } }, broken)
  assertEquals(r.status, 500)
  assertEquals(r.body.say, 'Something went wrong on the server.')
  assertEquals(JSON.stringify(r.body).includes('secret'), false)
  assertStringIncludes(m.logs[m.logs.length - 1].detail ?? '', 'secret')
  assertNotEquals(m.logs.length, 0)
})
