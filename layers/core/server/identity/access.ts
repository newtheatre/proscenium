// Identity's access provider: who is asking (from the session cookie), what they hold (from live
// grants) and which abilities the theatre attached to facts. The kit's `can` does the rest.
import type { H3Event } from 'h3'
import type { AccessProvider, Actor } from '#kit'
import { first, useContext } from '#kit'
import { currentSession } from './sessions'
import { kitGrantsOf, factAbilityMap } from './grants'
import { strongSignInSetUp } from './me'
import { checkOrigin } from './web'

/** Routes a recovery session may call: enrolling a passkey and signing out, nothing else. */
const LIMITED_ROUTES = [/^\/api\/core\/me$/, /^\/api\/core\/me\/passkeys(\/options)?$/, /^\/api\/core\/sign-out$/]

export const identityAccess: AccessProvider = {
  async actor(event: H3Event): Promise<Actor> {
    await checkOrigin(event)
    const session = await currentSession(event)
    if (!session) return { kind: 'anonymous' }
    if (session.limited && !LIMITED_ROUTES.some(r => r.test(event.path.split('?')[0]!))) return { kind: 'anonymous' }
    const cache = useContext().cache
    const key = `identityName:${session.accountId}`
    const row = await ((cache[key] as Promise<{ name: string | null, preferred_name: string | null } | null> | undefined)
      ?? (cache[key] = first<{ name: string | null, preferred_name: string | null }>('SELECT name, preferred_name FROM core_accounts WHERE id = ?', session.accountId)))
    return {
      kind: 'person',
      accountId: session.accountId,
      sessionId: session.id,
      name: row?.name || undefined,
      assurance: session.assurance,
      reassertedAt: session.reassertedAt ?? undefined,
    }
  },
  grants: async actor => actor.accountId ? kitGrantsOf(actor.accountId) : [],
  factAbilities: () => factAbilityMap(),
  strongSetUp: async actor => !!actor.accountId && strongSignInSetUp(actor.accountId),
}
