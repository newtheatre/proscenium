import { z } from 'zod'
import { isWorkspaceEmail } from './auth'
import { localPath } from './local-path'

// A theatre address has Google as its only credential, so nothing else is offered for it (0008).
export type WayIn = 'google' | 'email'

export function wayInFor(address: string): WayIn {
  return isWorkspaceEmail(address) ? 'google' : 'email'
}

// Where the person set out from rides on every link back, and only as a path on this site, so no
// emailed link can become an open redirect (0103).
export function withNext(url: string, next: unknown): string {
  const path = localPath(next)
  if (path === null) return url
  return `${url}${url.includes('?') ? '&' : '?'}next=${encodeURIComponent(path)}`
}

// It only says where to go afterwards, so one a route cannot use is dropped rather than refused.
export const nextField = z.string().max(2048).optional().catch(undefined)
