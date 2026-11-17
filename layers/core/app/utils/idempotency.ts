// Writes from the browser carry an Idempotency-Key (see plugins/api.ts).
const READS = ['GET', 'HEAD', 'OPTIONS']

/** The options with an Idempotency-Key added to a write that has none. */
export function withIdempotencyKey(options: unknown, makeKey: () => string = () => crypto.randomUUID()): unknown {
  const o = (options ?? {}) as { method?: string, headers?: HeadersInit }
  if (READS.includes((o.method ?? 'GET').toUpperCase())) return options
  const headers = new Headers(o.headers)
  if (headers.has('idempotency-key')) return options
  headers.set('idempotency-key', makeKey())
  return { ...o, headers }
}
