const HERE = 'https://local.invalid'

// A `next` is followed only as a path on this site. Resolving it as a browser would is the test,
// since a backslash reads as a slash and a tab is dropped, so `/\evil.example` is another origin.
export function localPath(next: unknown): string | null {
  if (typeof next !== 'string' || !next.startsWith('/')) return null
  const url = new URL(next, HERE)
  return url.origin === HERE ? `${url.pathname}${url.search}${url.hash}` : null
}
