// Which URL to remember in taskflow_settings.taskflow_url (the address other apps and notifications link back to).

const isPrivateHost = (host: string) =>
  host === 'localhost' || host.endsWith('.local') || host === '[::1]' ||
  /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host)

/**
 * The origin to save, or null: only a real https page on a public host counts, never localhost, a LAN address (the dev server
 * opened from the phone), or a Vercel preview URL. Null too when it is already what is stored.
 */
export function urlToRecord(origin: string, stored: string | null, previewHosts: RegExp = /\.vercel\.app$/): string | null {
  let u: URL
  try { u = new URL(origin) } catch { return null }
  if (u.protocol !== 'https:' || isPrivateHost(u.hostname) || previewHosts.test(u.hostname)) return null
  const clean = u.origin
  return stored?.replace(/\/+$/, '') === clean ? null : clean
}
