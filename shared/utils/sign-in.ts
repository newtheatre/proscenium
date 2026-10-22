import { z } from 'zod'
import { isWorkspaceEmail } from './auth'
import { RESERVED_DOMAIN_REFUSAL, hasReservedDomain } from './deliverability'
import { HOUSE_ERROR } from './house-errors'
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

// The registration form's own check. An empty field arrives undefined, so the type check carries the
// field's words, and a malformed address is called that rather than missing (A-101).
export const registerForm = z.object({
  name: z.string({ error: 'Enter your name' }).trim().min(1, 'Enter your name').max(200, 'That name is too long'),
  email: z.string({ error: 'Enter your email address' }).trim().min(1, 'Enter your email address').email(HOUSE_ERROR.email)
    .refine(email => !hasReservedDomain(email), RESERVED_DOMAIN_REFUSAL),
  password: z.string({ error: 'Choose a password' }).min(1, 'Choose a password'),
})
