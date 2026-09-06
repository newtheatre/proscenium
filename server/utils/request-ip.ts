import type { H3Event } from 'h3'

// Workers set this at the edge and nothing behind it can spoof it; local dev has no edge, so a
// fixed fallback keeps every request in one bucket rather than throwing (docs/known-issues.md).
export function clientIp(event: H3Event): string {
  return getHeader(event, 'cf-connecting-ip') ?? getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
}
