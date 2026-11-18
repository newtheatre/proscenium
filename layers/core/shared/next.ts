// The page to go on to after signing in or finishing a form, from `?next=`. Shared so the server and
// the pages apply one rule.

const MAX_PATH = 512 // not-policy: a return path is a short path on this site

/**
 * The page to return to after signing in (ID-07): a path on this site, or nothing. Anything that
 * could leave the site, written plainly or encoded, is dropped.
 */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_PATH) return null
  let decoded = raw
  for (let i = 0; i < 3; i++) { // not-policy: undo layered encoding a few times, then stop
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
    catch {
      return null
    }
  }
  for (const candidate of [raw, decoded]) {
    if (!candidate.startsWith('/')) return null
    if (candidate.startsWith('//') || candidate.startsWith('/\\')) return null
    if ([...candidate].some(c => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f || c === '\\')) return null // not-policy: control characters and backslashes
    if (/^\/[a-z][a-z0-9+.-]*:/i.test(candidate)) return null // not-policy: a scheme's characters
  }
  try {
    const url = new URL(raw, 'https://site.invalid')
    if (url.origin !== 'https://site.invalid') return null
    return `${url.pathname}${url.search}${url.hash}`
  }
  catch {
    return null
  }
}
