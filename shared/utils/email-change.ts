import { z } from 'zod'
import { isWorkspaceEmail, normaliseEmail } from './auth'

// Changing the address somebody signs in with, and the two things that refuse it. Pure, so the
// self-service path and any officer path added later share one answer (A-115).

export const emailChangeForm = z.object({
  // 320 is the longest address RFC 5321 permits: 64 local, an @, 255 domain.
  email: z.string().email().max(320),
})

export interface EmailChangeSubject {
  email: string
  hasPassword: boolean
}

export function refusalToChangeEmail(account: EmailChangeSubject, next: string): string | null {
  const wanted = normaliseEmail(next)
  if (wanted === normaliseEmail(account.email)) return 'That is already the address on this account'
  if (isWorkspaceEmail(wanted) && account.hasPassword) {
    return 'A Workspace address signs in with Google, so remove the password on this account first'
  }
  return null
}
