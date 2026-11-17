// Joining a free scheme with nothing to check is one request (MEM-11; J2). Never asks for a name,
// an address or a password: those are the account's (J7). A scheme that checks against a list is
// joined in the same request when the check passes (V1 to V4, D9); one checked by staff becomes an
// application waiting in their queue (V2, V3). Schemes that approve need the form builder
// and the fees module: an application for a paid scheme waits for its fee, charged now (P1), and
// activates when it is paid (A1). Approval needs the form builder, which does not exist yet.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse, today } from '#kit'
import { requireCharger } from '../../../../charge'
import { chooseLength, pendingOf, writePaying } from '../../../../joining'
import { holdsScheme, writeActive, writePending } from '../../../../memberships'
import { requireScheme } from '../../../../schemes'
import { recordOutcome, recordPass, runVerifier } from '../../../../verify'

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
  if (scheme.needsApproval)
    refuse('membership.join.not-online', 'This scheme cannot be joined online yet.', { status: 409, remedy: 'Contact the theatre to join.' })
  // S5: never silently free.
  if (scheme.requiresPayment) await requireCharger()
  // J3: a second attempt returns the first.
  const open = await pendingOf(accountId, scheme.id)
  if (open) return { membershipId: open.id, pending: true, waiting: open.waiting }
  // J4. Renewing inside the window is a later slice.
  if (await holdsScheme(accountId, scheme.id)) refuse('membership.join.already-held', 'You already hold this membership.', { status: 409 })
  const day = await today()
  const checked = await runVerifier(scheme, accountId, input.reference, day)
  // V2: waiting for staff is an application, pending until they pass or decline it.
  if (checked?.outcome === 'needs-staff') {
    const option = await chooseLength(scheme, input.lengthOptionId)
    const membershipId = scheme.requiresPayment
      ? (await writePaying(unit, { scheme, accountId, lengthOptionId: option?.id ?? null, verified: false, day })).membershipId
      : writePending(unit, { scheme, accountId, lengthOptionId: option?.id ?? null })
    recordOutcome(unit, membershipId, checked)
    unit.audit({ action: 'create', record: ['membership.membership', membershipId], detail: { origin: 'applied', waiting: checked.reason } })
    return { membershipId, pending: true, waiting: checked.reason }
  }
  const pass = checked?.outcome === 'passed' && checked.entryId ? { entryId: checked.entryId, endsOn: checked.endsOn ?? null } : null
  // D9: an entry's own end date wins, and the membership then has no length option.
  const option = pass?.endsOn ? null : await chooseLength(scheme, input.lengthOptionId)
  if (scheme.requiresPayment) {
    const { membershipId, quote } = await writePaying(unit, { scheme, accountId, lengthOptionId: option?.id ?? null, verified: true, day })
    if (pass) recordPass(unit, membershipId, accountId, pass)
    else if (checked) recordOutcome(unit, membershipId, checked)
    unit.audit({ action: 'create', record: ['membership.membership', membershipId], detail: { origin: 'applied', waiting: 'payment' } })
    return { membershipId, pending: true, waiting: 'payment', amountMinor: quote.amountMinor, currency: quote.currency }
  }
  const written = await writeActive(unit, {
    scheme, accountId, origin: 'applied', lengthOptionId: option?.id ?? null, count: option?.count ?? 1, startsOn: day,
    ...(pass?.endsOn ? { endsOn: pass.endsOn } : {}),
  })
  if (pass) recordPass(unit, written.membershipId, accountId, pass)
  else if (checked) recordOutcome(unit, written.membershipId, checked)
  unit.audit({ action: 'create', record: ['membership.membership', written.membershipId], detail: { origin: 'applied' } })
  return { ...written, pending: false, opensMembersArea: scheme.side === 'members' }
})
