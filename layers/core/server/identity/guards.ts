// Checks the "me" routes make themselves, because a person acting on their own account needs no
// ability: a fresh re-assertion before changing how they sign in, and the session they are using.
import type { H3Event } from 'h3'
import { nowMs, refuse, useSetting, type Actor } from '#kit'
import { currentSession, type CurrentSession } from './sessions'

/** The session behind a signed-in request. */
export async function sessionOf(event: H3Event): Promise<CurrentSession> {
  const session = await currentSession(event)
  if (!session) refuse('core.access.signed-out', 'You need to sign in to do this.', { status: 401, remedy: 'Sign in, then try again.' })
  return session
}

// The same refusal the kit gives a privileged ability, so the interface re-asserts and retries (ID-28).
export async function requireFresh(actor: Actor): Promise<void> {
  const within = await useSetting('core.access.fresh-within') as number
  if (!actor.reassertedAt || nowMs() - actor.reassertedAt > within * 1000) // not-policy: seconds to milliseconds
    refuse('core.access.not-fresh', 'For your safety, confirm it is you before doing this.', { status: 403, remedy: 'Confirm your sign-in, then try again.' })
}
