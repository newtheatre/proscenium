import { describe, expect, test } from 'bun:test'
import { createSessionPasswordResolver } from '#server/utils/session-password'
import type { SecretsStoreSecret, SessionPasswordRequest } from '#server/utils/session-password'

// The hook body of server/plugins/0.secrets-store.ts, threaded its inputs rather than reading
// them from a running Nitro (0057). K-131.

const PASSWORD = 'a'.repeat(32)

function binding(value = PASSWORD, fails = 0): SecretsStoreSecret {
  let attempts = 0
  return {
    get: async () => {
      attempts += 1
      if (attempts <= fails) throw new Error('store unavailable')
      return value
    },
  }
}

function external(secret: SecretsStoreSecret | undefined): SessionPasswordRequest {
  return { prerender: false, dev: false, cloudflareContext: true, env: { SESSION_PASSWORD: secret }, workerSecretSet: false }
}

// What Nitro hands a hook for an event created by a bare global $fetch: no platform context at
// all, so no binding to read and nothing on the event to say why.
const internal: SessionPasswordRequest = {
  prerender: false,
  dev: false,
  cloudflareContext: false,
  env: undefined,
  workerSecretSet: false,
}

describe('resolving the session password for one event', () => {
  test('an event carrying the binding resolves it', async () => {
    const outcome = await createSessionPasswordResolver()(external(binding()))
    expect(outcome.password).toBe(PASSWORD)
    expect(outcome.errors).toEqual([])
  })

  test('a following internal event gets the password the isolate already read', async () => {
    const resolve = createSessionPasswordResolver()
    await resolve(external(binding()))

    const outcome = await resolve(internal)
    expect(outcome.password).toBe(PASSWORD)
    expect(outcome.errors).toEqual([])
  })

  test('an internal event before any external one gets nothing, and says so once', async () => {
    const resolve = createSessionPasswordResolver()

    const first = await resolve(internal)
    expect(first.password).toBeNull()
    expect(first.errors).toHaveLength(1)
    expect(first.errors[0]).toContain('no SESSION_PASSWORD binding on this isolate')
    expect(first.errors[0]).toContain('internal request')

    expect((await resolve(internal)).errors).toEqual([])
  })

  test('nothing runs while prerendering', async () => {
    const resolve = createSessionPasswordResolver()
    const outcome = await resolve({ ...internal, prerender: true })

    expect(outcome.password).toBeNull()
    expect(outcome.errors).toEqual([])
    expect(outcome.warnings).toEqual([])
  })

  test('the store is read once per isolate, however many events ask', async () => {
    const resolve = createSessionPasswordResolver()
    let reads = 0
    const counted: SecretsStoreSecret = {
      get: async () => {
        reads += 1
        return PASSWORD
      },
    }

    await resolve(external(counted))
    await resolve(external(counted))
    await resolve(internal)

    expect(reads).toBe(1)
  })

  test('a read that blips is retried, and the retries are not held against it', async () => {
    const outcome = await createSessionPasswordResolver()(external(binding(PASSWORD, 2)))
    expect(outcome.password).toBe(PASSWORD)
  })

  test('a password too short to seal with is refused, not cached', async () => {
    const resolve = createSessionPasswordResolver()

    const first = await resolve(external(binding('short')))
    expect(first.password).toBeNull()
    expect(first.failure).toBeTruthy()

    expect((await resolve(external(binding()))).password).toBe(PASSWORD)
  })

  test('a leftover worker secret of the same name is named', async () => {
    const outcome = await createSessionPasswordResolver()({ ...external(binding()), workerSecretSet: true })
    expect(outcome.errors.join(' ')).toContain('NUXT_SESSION_PASSWORD')
  })

  test('locally an absent binding is expected and stays quiet', async () => {
    const outcome = await createSessionPasswordResolver()({ ...internal, dev: true })
    expect(outcome.password).toBeNull()
    expect(outcome.errors).toEqual([])
  })
})
