// The `0.` prefix is load-bearing: this must hydrate the session password before any plugin
// reads a session, or the isolate memoises an empty password permanently (0007).

import { createSessionPasswordResolver } from '#server/utils/session-password'
import type { SecretsStoreSecret } from '#server/utils/session-password'

// Nitro builds runtimeConfig per event, so the isolate's one read has to be applied to every
// event, including an internal one that carries no binding to read (0007, K-131).
const resolveSessionPassword = createSessionPasswordResolver()

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    const outcome = await resolveSessionPassword({
      prerender: Boolean(import.meta.prerender),
      dev: Boolean(import.meta.dev),
      cloudflareContext: Boolean(event.context.cloudflare),
      env: event.context.cloudflare?.env as unknown as Record<string, SecretsStoreSecret | undefined> | undefined,
      workerSecretSet: Boolean(process.env.NUXT_SESSION_PASSWORD),
    })

    for (const line of outcome.warnings) console.warn(line)
    for (const line of outcome.errors) console.error(line)

    if (outcome.password) useRuntimeConfig(event).session.password = outcome.password

    // This does not abort the request: Nitro's onRequest catches a `request` hook's rejection
    // for logging only. iron-webcrypto's own length guard is the real backstop.
    if (outcome.failure) throw outcome.failure
  })
})
