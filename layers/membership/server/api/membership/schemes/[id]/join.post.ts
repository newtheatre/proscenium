// Joining a free scheme with nothing to check is one request (MEM-11; J2). Never asks for a name,
// an address or a password: those are the account's (J7). A scheme that checks against a list is
// joined in the same request when the check passes (V1 to V4, D9). Schemes that approve or charge
// are joined through applications, which come in a later slice.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse, today } from '#kit'
import { chooseLength, pendingOf } from '../../../../joining'
import { holdsScheme, writeActive } from '../../../../memberships'
import { requireScheme } from '../../../../schemes'
import { schemeList } from '../../../../lists'
import { passList, recordPass } from '../../../../verify'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    lengthOptionId: z.string().nullish(),
    // The reference a list scheme checks, such as a student ID. Hashed, never stored (V10).
    reference: z.string().trim().max(254).nullish(), // not-policy: an address's bound
  }),
}, async (event, { input, actor, unit }) => {
  const scheme = await requireScheme(getRouterParam(event, 'id'))
  const accountId = actor.accountId!
  if (scheme.state !== 'open') refuse('membership.join.not-open', 'This scheme is not taking new members.', { status: 409 })
  if (scheme.joinMode === 'staff-only') refuse('membership.join.staff-only', 'Membership of this scheme is given by the theatre.', { status: 409 })
  const list = scheme.verifier ? await schemeList(scheme) : null
  if ((scheme.verifier && !list) || scheme.needsApproval || scheme.requiresPayment)
    refuse('membership.join.not-online', 'This scheme cannot be joined online yet.', { status: 409, remedy: 'Contact the theatre to join.' })
  if (await pendingOf(accountId, scheme.id)) refuse('membership.join.pending', 'You have already applied for this scheme.', { status: 409 })
  // J4. Renewing inside the window is a later slice.
  if (await holdsScheme(accountId, scheme.id)) refuse('membership.join.already-held', 'You already hold this membership.', { status: 409 })
  const day = await today()
  const pass = list ? await passList(list, accountId, input.reference, day) : null
  // D9: an entry's own end date wins, and the membership then has no length option.
  const option = pass?.endsOn ? null : await chooseLength(scheme, input.lengthOptionId)
  const written = await writeActive(unit, {
    scheme, accountId, origin: 'applied', lengthOptionId: option?.id ?? null, count: option?.count ?? 1, startsOn: day,
    ...(pass?.endsOn ? { endsOn: pass.endsOn } : {}),
  })
  if (pass) recordPass(unit, written.membershipId, accountId, pass)
  unit.audit({ action: 'create', record: ['membership.membership', written.membershipId], detail: { origin: 'applied' } })
  return { ...written, opensMembersArea: scheme.side === 'members' }
})
