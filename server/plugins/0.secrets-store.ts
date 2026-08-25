/**
 * ⚠️ The `0.` prefix is load-bearing: this must hydrate the session password
 * before any plugin reads a session. Both traps: ADR-0016.
 */
interface SecretsStoreSecret {
  get: () => Promise<string>
}

// One read per isolate, so a rotation only reaches a running isolate when it
// is recycled.
let sessionPassword: Promise<string> | undefined
let warnedAboutWorkerSecret = false

/** Enough to ride out a Secrets Store blip, few enough to fail fast. */
const READ_ATTEMPTS = 3

async function readSecret(secret: SecretsStoreSecret): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
    try {
      return await secret.get()
    }
    catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    const env = event.context.cloudflare?.env as unknown as
      | Record<string, SecretsStoreSecret | undefined>
      | undefined
    const secret = env?.SESSION_PASSWORD
    if (!secret) return

    // A leftover worker secret of this name beats the store and the key mismatch
    // looks nothing like its cause, so warn loudly (ADR-0016).
    if (!warnedAboutWorkerSecret && process.env.NUXT_SESSION_PASSWORD) {
      warnedAboutWorkerSecret = true
      console.error(
        '[secrets-store] NUXT_SESSION_PASSWORD is set as a worker secret and takes '
        + 'priority over the SESSION_PASSWORD store binding: this app is sealing '
        + 'sessions with the wrong key. Run `wrangler secret delete '
        + 'NUXT_SESSION_PASSWORD --name proscenium`, then redeploy.',
      )
    }

    try {
      sessionPassword ??= readSecret(secret)
      useRuntimeConfig(event).session.password = await sessionPassword
    }
    catch (error) {
      // Don't pin a failed read for the life of the isolate.
      sessionPassword = undefined
      console.error('[secrets-store] could not read SESSION_PASSWORD', error)
      // Rethrow to skip the remaining request hooks: the next one reads a
      // session, which memoises the empty password for good (ADR-0040).
      throw error
    }
  })
})
