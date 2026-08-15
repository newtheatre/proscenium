import { Resend } from 'resend'

let client: Resend | null | undefined

/**
 * Returns null rather than throwing when no key is set, so a missing key
 * disables email instead of taking the Worker down at import time.
 */
export function getResend(): Resend | null {
  if (client !== undefined) return client

  const key = useRuntimeConfig().resendApiKey || process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[Email] No Resend API key configured; email sending is disabled.')
    client = null
    return null
  }

  client = new Resend(key)
  return client
}
