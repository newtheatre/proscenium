// Calls to identity's routes from the minimal sign-in screens. Refusals come back as values, so a
// page shows the reason and remedy the server wrote rather than a generic error.
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

export interface Refusal { code: string, reason: string, remedy?: string, fields?: Record<string, string> }
export type Answer<T> = { ok: true, data: T } | { ok: false, refusal: Refusal }

export async function callIdentity<T>(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Answer<T>> {
  // Sent through `$api`, so a refusal of "confirm it is you" is confirmed in place and retried.
  // The path is only known at run time, so the typed fetch is used as a plain one.
  const send = useNuxtApp().$api as unknown as (path: string, options: object) => Promise<T>
  try {
    return { ok: true, data: await send(path, { method: body === undefined ? 'GET' : 'POST', body, headers }) }
  }
  catch (error) {
    const data = (error as { data?: unknown }).data
    const refusal = data && typeof data === 'object' && typeof (data as Refusal).code === 'string'
      ? data as Refusal
      : { code: 'core.unexpected', reason: 'Something went wrong.', remedy: 'Try again in a moment.' }
    return { ok: false, refusal }
  }
}

const cancelled: Refusal = { code: 'core.passkey.cancelled', reason: 'The passkey was not used.', remedy: 'Try again, or sign in another way.' }

/** Proves a passkey: asks for options at `optionsPath`, then posts the proof to `path`. */
export async function provePasskey<T>(optionsPath: string, path: string, extra: Record<string, unknown> = {}): Promise<Answer<T>> {
  const options = await callIdentity<{ challengeId: string, options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>(optionsPath, {})
  if (!options.ok) return options
  let response
  try {
    response = await startAuthentication({ optionsJSON: options.data.options })
  }
  catch {
    return { ok: false, refusal: cancelled }
  }
  return callIdentity<T>(path, { challengeId: options.data.challengeId, response, ...extra })
}

/** Makes a passkey from registration options already fetched. */
export async function makePasskey(options: Parameters<typeof startRegistration>[0]['optionsJSON']): Promise<Answer<Awaited<ReturnType<typeof startRegistration>>>> {
  try {
    return { ok: true, data: await startRegistration({ optionsJSON: options }) }
  }
  catch {
    return { ok: false, refusal: cancelled }
  }
}

/** Adds a passkey to the signed-in account; answers the new recovery codes when it was the first. */
export async function addMyPasskey(label?: string): Promise<Answer<{ passkeyId: string, recoveryCodes: string[] | null }>> {
  const options = await callIdentity<{ challengeId: string, options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>('/api/core/me/passkeys/options', {})
  if (!options.ok) return options
  const made = await makePasskey(options.data.options)
  if (!made.ok) return made
  return callIdentity('/api/core/me/passkeys', { challengeId: options.data.challengeId, response: made.data, label })
}

/** A return path on this site only, from `?next=`. */
export function nextPath(value: unknown): string | undefined {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : undefined
}

/**
 * Goes on after a sign-in. Everything the app fetched so far (who is looking, the account menu,
 * each shell's menu) was fetched signed out, so it is cleared and fetched again first: the header
 * shows the account menu at once, without a reload. With `offerPasskey`, the passkey page comes first.
 */
export async function arriveSignedIn(target: { next: string, offerPasskey?: boolean }) {
  clearNuxtData()
  await refreshNuxtData()
  if (target.offerPasskey) return navigateTo({ path: '/account/passkey', query: { next: target.next } })
  return navigateTo(target.next)
}
