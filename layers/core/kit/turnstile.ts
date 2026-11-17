// Turnstile, the one challenge (protect: 'turnstile'). Quietly off when the theatre has not set
// CORE_TURNSTILE_SECRET_KEY, as an optional credential should be. The key is saved on Admin >
// Sign-in, or set as a Worker secret of the same name.
import { credential } from './secrets'

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = await credential('CORE_TURNSTILE_SECRET_KEY')
  if (!secret) return true
  if (!token) return false
  const body = new FormData()
  body.set('secret', secret)
  body.set('response', token)
  if (ip && ip !== 'unknown') body.set('remoteip', ip)
  try {
    const response = await fetch(SITEVERIFY, { method: 'POST', body })
    const result = await response.json() as { success?: boolean }
    return result.success === true
  }
  catch {
    return false
  }
}
