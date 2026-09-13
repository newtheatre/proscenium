// The hook body of server/plugins/0.secrets-store.ts, kept a function of its inputs so it can be
// tested without a running Nitro and without reaching for useRuntimeConfig (0055, 0057).

export interface SecretsStoreSecret {
  get: () => Promise<string>
}

export interface SessionPasswordRequest {
  prerender: boolean
  dev: boolean
  // Whether the event carried a Cloudflare platform context at all: an internally created event
  // has none, which is a different fault from a deployment with the binding missing.
  cloudflareContext: boolean
  env: Record<string, SecretsStoreSecret | undefined> | undefined
  workerSecretSet: boolean
}

export interface SessionPasswordOutcome {
  password: string | null
  warnings: string[]
  errors: string[]
  // A failed read, for the caller to rethrow: Nitro logs a request hook's rejection.
  failure: unknown
}

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

export function createSessionPasswordResolver(): (request: SessionPasswordRequest) => Promise<SessionPasswordOutcome> {
  // One read per isolate, so a rotation only reaches a running isolate when it is recycled.
  let reading: Promise<string> | undefined
  let resolved: string | undefined
  let warnedAboutWorkerSecret = false
  let warnedAboutMissingBinding = false
  let warnedAboutUnreadableLocally = false

  return async function resolve(request: SessionPasswordRequest): Promise<SessionPasswordOutcome> {
    const outcome: SessionPasswordOutcome = { password: null, warnings: [], errors: [], failure: null }

    // Prerendering runs with nothing bound and no secrets set, so every check here is noise.
    if (request.prerender) return outcome

    const secret = request.env?.SESSION_PASSWORD

    if (!secret) {
      // Nitro builds runtimeConfig per event, so the password has to be applied to each one;
      // an internal event carries no binding, and the isolate's own read stands for it (0007).
      if (resolved) {
        outcome.password = resolved
        return outcome
      }

      // Locally the password comes from .env and there is no store to bind, so the absence is
      // expected; in production it means no request this isolate serves can read a session.
      if (!warnedAboutMissingBinding && !request.dev) {
        warnedAboutMissingBinding = true
        outcome.errors.push(
          '[secrets-store] no SESSION_PASSWORD binding on this isolate: '
          + `cloudflare context ${request.cloudflareContext ? 'present' : 'absent'}, `
          + `env keys ${request.env ? Object.keys(request.env).length : 'none'}. `
          + 'Either the binding is missing from the deployment, or this is an internal request '
          + 'reaching the isolate before the first external one, which carries no platform '
          + 'context and so no binding to read. Nothing here can read a session until a '
          + 'password arrives.',
        )
      }
      return outcome
    }

    // A leftover worker secret of this name beats the store binding, and the resulting key
    // mismatch looks nothing like its cause.
    if (!warnedAboutWorkerSecret && request.workerSecretSet) {
      warnedAboutWorkerSecret = true
      outcome.errors.push(
        '[secrets-store] NUXT_SESSION_PASSWORD is set as a worker secret and takes '
        + 'priority over the SESSION_PASSWORD store binding: this app is sealing '
        + 'sessions with the wrong key. Run `wrangler secret delete '
        + 'NUXT_SESSION_PASSWORD --name nnt-unified`, then redeploy.',
      )
    }

    try {
      reading ??= readSecret(secret)
      const password = await reading

      // A resolved-but-empty or too-short read is not a blip: the catch below must treat it
      // exactly like a thrown one, never sealing a session with it.
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`SESSION_PASSWORD resolved to ${password.length} characters, refusing to seal with it`)
      }

      resolved = password
      outcome.password = password
      return outcome
    }
    catch (error) {
      // Do not pin a failed read for the life of the isolate.
      reading = undefined

      if (request.dev) {
        // The store has no local emulation, so a binding that exists but cannot be read, or
        // reads empty, is routine here; the .env value already stands, same as no binding at all.
        if (!warnedAboutUnreadableLocally) {
          warnedAboutUnreadableLocally = true
          outcome.warnings.push(`[secrets-store] SESSION_PASSWORD binding unusable locally, falling back to .env: ${String(error)}`)
        }
        return outcome
      }

      outcome.errors.push('[secrets-store] could not read SESSION_PASSWORD')
      outcome.failure = error
      return outcome
    }
  }
}
