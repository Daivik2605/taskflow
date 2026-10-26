import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useConnection } from '../../app/connection'
import { btn, btnDanger, btnPrimary, card, input, label, sectionTitle } from '../../components/ui'
import { db, friendlyDbError } from '../../data/db'
import { apiBaseUrl, generateToken, hashToken, isTokenName, tokenPrefix, type ApiLogRow, type ApiToken } from '../../lib/apiToken'
import { formatDay, formatTime, dayOf } from '../../lib/time'

const stamp = (iso: string) => `${formatDay(dayOf(iso))} ${formatTime(iso)}`

/** Settings → Shortcuts: personal API tokens for iPhone Shortcuts, Back Tap and Siri. A token is shown once, stored only as a hash, and can be revoked. */
export function ShortcutsSettings() {
  const { writesDisabled } = useConnection()
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [log, setLog] = useState<ApiLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const base = apiBaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)

  const load = useCallback(async () => {
    const [t, l] = await Promise.all([
      db().from('taskflow_api_tokens').select('id,name,prefix,created_at,last_used_at,revoked_at').order('created_at', { ascending: false }),
      db().from('taskflow_api_log').select('id,endpoint,at,ok,detail').order('at', { ascending: false }).limit(8),
    ])
    if (t.error) { setError(friendlyDbError(t.error)); setLoading(false); return }
    setTokens((t.data ?? []) as ApiToken[])
    setLog((l.data ?? []) as ApiLogRow[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what) } catch { setCopied(null); setError('Copy failed: select the text and copy it by hand.') }
  }

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!isTokenName(name)) { setError('Give the token a name, such as "iPhone".'); return }
    setError(null)
    const token = generateToken()
    const { error: err } = await db().from('taskflow_api_tokens').insert({ name: name.trim(), token_hash: await hashToken(token), prefix: tokenPrefix(token) })
    if (err) { setError(friendlyDbError(err)); return }
    setFresh({ name: name.trim(), token })
    setCopied(null)
    setName('')
    await load()
  }

  const revoke = async (id: string) => {
    const { error: err } = await db().from('taskflow_api_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null)
    setConfirmRevoke(null)
    if (err) { setError(friendlyDbError(err)); return }
    await load()
  }

  return (
    <div>
      <h2 className={sectionTitle}>Shortcuts</h2>
      <p className="mb-2 text-sm text-slate-500">
        Log without opening the app: iPhone Shortcuts, Back Tap and Siri call a small web address with a personal token. A token works only on your own data, and you can revoke it here at once. The step-by-step guide is in <code>docs/SHORTCUTS.md</code>.
      </p>

      {base && (
        <div className={`${card} mb-3 flex items-center gap-2 p-3`}>
          <div className="min-w-0 flex-1"><span className="block text-xs text-slate-500">Address (the Shortcuts add /counter, /capture, … to it)</span><code className="block truncate text-sm">{base}</code></div>
          <button type="button" className={btn} onClick={() => void copy('url', base)}>{copied === 'url' ? 'Copied' : 'Copy'}</button>
        </div>
      )}

      {fresh && (
        <div role="alert" className="mb-3 space-y-2 rounded-xl border border-emerald-400 bg-emerald-50 p-3 dark:bg-emerald-950">
          <p className="text-sm font-semibold">Token “{fresh.name}” created. Copy it now: it is shown only once.</p>
          <code aria-label="New token" className="block break-all rounded-lg bg-white p-2 text-sm dark:bg-slate-900">{fresh.token}</code>
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} onClick={() => void copy('token', fresh.token)}>{copied === 'token' ? 'Copied' : 'Copy token'}</button>
            <button type="button" className={btn} onClick={() => setFresh(null)}>I've saved it</button>
          </div>
        </div>
      )}

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : tokens.length === 0 ? <p className="mb-3 text-sm text-slate-500">No tokens yet.</p> : (
        <ul className={`${card} mb-3 divide-y divide-slate-100 dark:divide-slate-800`} aria-label="API tokens">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">{t.name} {t.revoked_at && <span className="text-xs font-normal text-red-600 dark:text-red-400">revoked</span>}</span>
                <span className="block truncate text-xs text-slate-500">{t.prefix} · made {stamp(t.created_at)} · {t.last_used_at ? `last used ${stamp(t.last_used_at)}` : 'never used'}</span>
              </div>
              {!t.revoked_at && (confirmRevoke === t.id
                ? <>
                    <button type="button" className={`${btnDanger} min-h-9 px-3`} disabled={writesDisabled} onClick={() => void revoke(t.id)} aria-label={`Confirm revoke ${t.name}`}>Revoke</button>
                    <button type="button" className={`${btn} min-h-9 px-3`} onClick={() => setConfirmRevoke(null)}>Keep</button>
                  </>
                : <button type="button" className={`${btn} min-h-9 px-3`} disabled={writesDisabled} onClick={() => setConfirmRevoke(t.id)} aria-label={`Revoke ${t.name}`}>Revoke</button>)}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className={`${card} space-y-3 p-3`} aria-label="Create a token" noValidate>
        <label className={label}>Token name<input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="iPhone" maxLength={60} /></label>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button className={btnPrimary} disabled={writesDisabled || !name.trim()}>Create token</button>
      </form>

      {log.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1 text-sm font-semibold text-slate-500">Recent calls</h3>
          <ul className={`${card} divide-y divide-slate-100 text-sm dark:divide-slate-800`} aria-label="Recent API calls">
            {log.map((l) => (
              <li key={l.id} className="flex justify-between gap-2 px-3 py-1.5">
                <span>{l.endpoint}{!l.ok && l.detail ? <span className="text-xs text-red-600 dark:text-red-400"> · {l.detail}</span> : null}</span>
                <span className="shrink-0 text-xs text-slate-500">{l.ok ? 'ok' : 'failed'} · {stamp(l.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
