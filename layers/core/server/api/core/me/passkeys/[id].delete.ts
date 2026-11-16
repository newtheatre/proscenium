// Remove one of my passkeys. Needs a fresh re-assertion, and the only way in stays (ID-14): the
// last passkey goes only while a verified address can still receive links, or a provider is linked.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, refuse } from '#kit'
import { requireFresh, sessionOf } from '../../../../identity/guards'
import { passkeyCount } from '../../../../identity/passkeys'
import { hasOtherWayIn } from '../../../../identity/me'
import { guardLastOwner, isOwner } from '../../../../identity/grants'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const session = await sessionOf(event)
  await requireFresh(actor)
  const id = getRouterParam(event, 'id') ?? ''
  const found = await first('SELECT 1 AS one FROM core_passkeys WHERE id = ? AND account_id = ?', id, session.accountId) // exact-account: identity's own table, keyed by the living account
  if (!found) refuse('core.not-found', 'There is no such passkey.', { status: 404 })
  if ((await passkeyCount(session.accountId)) === 1 && !(await hasOtherWayIn(session.accountId)))
    refuse('core.passkey.only-way-in', 'This is your only way to sign in, so it cannot be removed.', { status: 409, remedy: 'Add another passkey first.' })
  unit.add({ sql: 'DELETE FROM core_passkeys WHERE id = ? AND account_id = ?', params: [id, session.accountId] }).expect(1) // exact-account: identity's own table, keyed by the living account
  if (await isOwner(session.accountId)) guardLastOwner(unit)
  unit.audit({ action: 'delete', record: ['core.account', session.accountId], detail: { passkeyId: id } })
  return { removed: id }
})
