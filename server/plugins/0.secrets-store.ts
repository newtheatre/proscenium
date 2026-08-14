/**
 * Copies Cloudflare Secrets Store values into runtimeConfig at the start of
 * every request. No-op in dev, where the password comes from `.env`.
 *
 * ⚠️ THE `0.` PREFIX IS LOAD-BEARING — DO NOT RENAME THIS FILE. Nitro orders
 * `request` hooks by filename, and nuxt-auth-utils memoises the session
 * password on the first session read of the isolate. Sorting after a plugin
 * that reads the session pins the empty default, permanently and silently.
 *
 * ⚠️ The binding is `SESSION_PASSWORD`, NOT `NUXT_SESSION_PASSWORD`: Nitro's
 * `applyEnv` would copy a `NUXT_*` binding object into `session.password`.
 *
 * Both traps, and the worker-secret conflict below: ADR-0016.
 *
 * Scheduled tasks do not run the request hook. A task needing a store-backed
 * secret must read the binding itself.
 */
interface SecretsStoreSecret {
  get: () => Promise<string>
}

// One read per isolate, so a rotation only reaches a running isolate when it
// is recycled.
let sessionPassword: Promise<string> | undefined
let warnedAboutWorkerSecret = false

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    const env = event.context.cloudflare?.env as unknown as
      | Record<string, SecretsStoreSecret | undefined>
      | undefined
    const secret = env?.SESSION_PASSWORD
    if (!secret) return

    // A leftover worker secret of this name beats the store — defu gives
    // process.env priority over runtimeConfig.session — and the resulting
    // key mismatch looks nothing like its cause. Warn loudly (ADR-0016).
    if (!warnedAboutWorkerSecret && process.env.NUXT_SESSION_PASSWORD) {
      warnedAboutWorkerSecret = true
      console.error(
        '[secrets-store] NUXT_SESSION_PASSWORD is set as a worker secret and takes '
        + 'priority over the SESSION_PASSWORD store binding — this app is sealing '
        + 'sessions with the wrong key. Run `wrangler secret delete '
        + 'NUXT_SESSION_PASSWORD --name proscenium`, then redeploy.',
      )
    }

    try {
      sessionPassword ??= secret.get()
      useRuntimeConfig(event).session.password = await sessionPassword
    }
    catch (error) {
      // Don't pin a failed read for the life of the isolate.
      sessionPassword = undefined
      console.error('[secrets-store] could not read SESSION_PASSWORD', error)
    }
  })
})
