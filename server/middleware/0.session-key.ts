/**
 * ⚠️ The `0.` prefix is load-bearing: no handler may read a session until this
 * has run, or the isolate memoises an empty password for good (ADR-0040).
 */

import type { H3Event } from 'h3'

/** Reports the same fault itself, and naming it is the whole point of it. */
const REPORTS_ITS_OWN_STATE = /^\/api\/health\/?$/

let warned = false

export default defineEventHandler((event: H3Event) => {
  const path = (event.path ?? '').split('?')[0] ?? ''
  if (REPORTS_ITS_OWN_STATE.test(path)) return
  if (useRuntimeConfig(event).session.password) return

  if (!warned) {
    warned = true
    console.error(
      '[session-key] no session password: the Secrets Store read failed, or '
      + 'NUXT_SESSION_PASSWORD is unset in development. Refusing every request '
      + 'until it arrives, because serving one would seal the isolate to an '
      + 'empty key.',
    )
  }

  throw createError({ statusCode: 503, statusMessage: 'Starting up, please try again shortly.' })
})
