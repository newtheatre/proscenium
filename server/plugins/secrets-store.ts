/**
 * Copies Cloudflare Secrets Store values into runtimeConfig at the start of
 * every request.
 *
 * `NUXT_SESSION_PASSWORD` is shared by every app on the estate (stage-door
 * docs/session-contract.md), so it lives in the account Secrets Store rather
 * than as four worker secrets that have to be rotated in lockstep. The
 * trade-off is that a Secrets Store binding is an object with an async
 * `get()`, not a string: Nitro's env → runtimeConfig mapping cannot consume
 * one, and nuxt-auth-utils reads `runtimeConfig.session.password`
 * synchronously the first time a session is touched. So the value has to be
 * put there before any handler runs, which is what this plugin does.
 *
 * ⚠️ The binding is deliberately NOT named `NUXT_SESSION_PASSWORD`. On
 * Workers `process.env` is a proxy over the bindings object, and Nitro's
 * `applyEnv` copies any `NUXT_*` key onto the matching runtimeConfig path — so
 * a NUXT_-prefixed binding would land the *binding object* in
 * `session.password` and break sealing in a thoroughly confusing way. The
 * store-side secret keeps its `NUXT_` name; only the binding drops it. Same
 * rule applies to anything else moved into the store.
 *
 * Scheduled tasks do not go through the request hook. None of ours seal
 * sessions, so nothing is missing today — but a task that needs a
 * store-backed secret must read the binding itself.
 *
 * Note for `bookingTokenSecret`, which falls back to the session password when
 * unset: that fallback resolves inside request handlers, so it sees the value
 * this plugin has already written.
 *
 * In dev there is no binding and this is a no-op: the password comes from
 * NUXT_SESSION_PASSWORD in `.env` as docs/01-getting-started.md describes.
 */
interface SecretsStoreSecret {
  get: () => Promise<string>
}

// One read per isolate. A rotation therefore only reaches a running isolate
// when it is recycled — the same staleness plain worker secrets have, since
// nuxt-auth-utils memoises its own session config on first use regardless.
let sessionPassword: Promise<string> | undefined
let warnedAboutWorkerSecret = false

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    const env = event.context.cloudflare?.env as unknown as
      | Record<string, SecretsStoreSecret | undefined>
      | undefined
    const secret = env?.SESSION_PASSWORD
    if (!secret) return

    // A leftover worker secret of this name BEATS the store. nuxt-auth-utils
    // resolves the password as
    //   defu({ password: process.env.NUXT_SESSION_PASSWORD }, runtimeConfig.session)
    // and defu gives its first argument priority, so whatever we write below
    // loses. The failure is silent and looks nothing like its cause: this app
    // seals with the stale key, auth seals with the store key, and a user who
    // logs in successfully is bounced straight back to the login page. It cost
    // an evening on 2026-08-14 (ADR-0016). Say so loudly rather than let the
    // next person derive it from first principles.
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
