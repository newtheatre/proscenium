// The `0.` prefix is load-bearing: this must hydrate the session password before any plugin
// reads a session, or the isolate memoises an empty password permanently (0007).

interface SecretsStoreSecret {
  get: () => Promise<string>
}

// One read per isolate, so a rotation only reaches a running isolate when it is recycled.
let sessionPassword: Promise<string> | undefined
let warnedAboutWorkerSecret = false
let warnedAboutMissingBinding = false
let warnedAboutUnreadableLocally = false

// Enough to ride out a Secrets Store blip, few enough to fail fast.
const READ_ATTEMPTS = 3

// iron-webcrypto refuses to seal below this: an empty or short read is never a real password.
const MIN_PASSWORD_LENGTH = 32

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

    if (!secret) {
      // Locally the password comes from .env and there is no store to bind, so the absence
      // is expected; in production it means every request this isolate serves is refused.
      if (!warnedAboutMissingBinding && !import.meta.dev) {
        warnedAboutMissingBinding = true
        console.error(
          '[secrets-store] no SESSION_PASSWORD binding on this isolate: '
          + `cloudflare context ${event.context.cloudflare ? 'present' : 'absent'}, `
          + `env keys ${env ? Object.keys(env).length : 'none'}. `
          + 'Every request this isolate serves will be refused.',
        )
      }
      return
    }

    // A leftover worker secret of this name beats the store binding, and the resulting key
    // mismatch looks nothing like its cause.
    if (!warnedAboutWorkerSecret && process.env.NUXT_SESSION_PASSWORD) {
      warnedAboutWorkerSecret = true
      console.error(
        '[secrets-store] NUXT_SESSION_PASSWORD is set as a worker secret and takes '
        + 'priority over the SESSION_PASSWORD store binding: this app is sealing '
        + 'sessions with the wrong key. Run `wrangler secret delete '
        + 'NUXT_SESSION_PASSWORD --name nnt-unified`, then redeploy.',
      )
    }

    try {
      sessionPassword ??= readSecret(secret)
      const password = await sessionPassword

      // A resolved-but-empty or too-short read is not a blip: the catch below must treat it
      // exactly like a thrown one, never sealing a session with it.
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`SESSION_PASSWORD resolved to ${password.length} characters, refusing to seal with it`)
      }

      useRuntimeConfig(event).session.password = password
    }
    catch (error) {
      // Do not pin a failed read for the life of the isolate.
      sessionPassword = undefined

      if (import.meta.dev) {
        // The store has no local emulation, so a binding that exists but cannot be read, or
        // reads empty, is routine here; the .env value already stands, same as no binding at all.
        if (!warnedAboutUnreadableLocally) {
          warnedAboutUnreadableLocally = true
          console.warn('[secrets-store] SESSION_PASSWORD binding unusable locally, falling back to .env', error)
        }
        return
      }

      console.error('[secrets-store] could not read SESSION_PASSWORD', error)
      // This does not abort the request: Nitro's onRequest catches a `request` hook's
      // rejection for logging only. iron-webcrypto's own length guard is the real backstop.
      throw error
    }
  })
})
