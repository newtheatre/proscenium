import { Resend } from 'resend'

let client: Resend | null | undefined

/**
 * Lazily construct the Resend client.
 *
 * The key is read from `runtimeConfig.resendApiKey` (env `NUXT_RESEND_API_KEY`),
 * falling back to the bare `RESEND_API_KEY` environment variable for backwards
 * compatibility. When no key is configured this returns `null` rather than
 * throwing, so a missing key degrades email to a no-op instead of taking the
 * whole Worker down at import time.
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
