// Which addresses maintenance mode leaves open. Pure, so the server and the browser share it.
//
// Open to everybody: the build's own files and frameworks' addresses (anything under /_), stored
// files, the platform's probes, signing in and first-run setup, the staff shells (they check access
// themselves), the core's API (signing in, the viewer, the brand, public settings), every provider's
// webhook, this module's own API, and whatever a module contributes to maintenance.open-address.
// Everything else (the public pages, My account, the members' area and every other module's API)
// is closed to anybody who is not staff.

const ALWAYS_OPEN = [
  '/_', '/files/', '/cdn-cgi/', '/favicon', '/robots.txt',
  '/sign-in', '/setup',
  '/console', '/admin', '/live',
  '/api/core/', '/api/maintenance/',
] as const

const WEBHOOK = /^\/api\/[a-z0-9-]+\/webhooks(\/|$)/

/** Whether `prefix` covers `path`: the same address, or one below it. A prefix ending in / covers what follows. */
function covers(prefix: string, path: string): boolean {
  if (!path.startsWith(prefix)) return false
  if (prefix.endsWith('/') || prefix === '/_') return true
  const next = path.charAt(prefix.length)
  return next === '' || next === '/' || next === '?' || next === '.'
}

/** Whether maintenance mode leaves this path open to everybody. */
export function isOpenAddress(path: string, contributed: readonly string[] = []): boolean {
  if (WEBHOOK.test(path)) return true
  return ALWAYS_OPEN.some(p => covers(p, path)) || contributed.some(p => covers(p, path))
}

/** Whether the path is the API's, so a closed answer is a refusal rather than the holding page. */
export function isApi(path: string): boolean {
  return path === '/api' || path.startsWith('/api/')
}
