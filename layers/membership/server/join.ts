// Joining a free scheme with nothing to check is one request (MEM-11; J2). Never asks for a name,
// an address or a password: those are the account's (J7). A scheme that checks against a list is
// joined in the same request when the check passes (V1 to V4, D9); one checked by staff becomes an
// application waiting in their queue (V2, V3). A scheme with an application form takes its answers
// in the same request (MEM-12); one that approves waits for that form's decision (MEM-16). An
// application for a paid scheme waits for its fee, charged now (P1), and activates when it is paid
// and nothing else is outstanding (A1).
import { refuse, today, type Actor, type UnitView } from '#kit'
import { answerApplication } from './application'
import { requireCharger } from './charge'
import { listSetsEnd, schemeList } from './lists'
import { chooseLength, pendingOf, writePaying } from './joining'
import { holdsScheme, writeActive, writePending } from './memberships'
import { recordOutcome, recordPass, runVerifier } from './verify'
import type { Scheme } from './schemes'

export interface JoinInput {
  lengthOptionId?: string | null
  reference?: string | null
  askStaff?: boolean
  form?: { formId: string, answers: Record<string, unknown> } | null
}

/** Joins a scheme, or applies to it, for the signed-in actor: the route's work, shared with a request made while booking. */
export async function joinScheme(unit: UnitView, actor: Actor, scheme: Scheme, input: JoinInput) {
  const accountId = actor.accountId!
  if (scheme.state !== 'open') refuse('membership.join.not-open', 'This scheme is not taking new members.', { status: 409 })
  if (scheme.joinMode === 'staff-only') refuse('membership.join.staff-only', 'Membership of this scheme is given by the theatre.', { status: 409 })
  // S5: never silently free.
  if (scheme.requiresPayment) await requireCharger()
  // J3: a second attempt returns the first.
  const open = await pendingOf(accountId, scheme.id)
  if (open) return { membershipId: open.id, pending: true, waiting: open.waiting }
  // J4. Renewing inside the window is a later slice.
  if (await holdsScheme(accountId, scheme.id)) refuse('membership.join.already-held', 'You already hold this membership.', { status: 409 })
  const day = await today()
  const checked = await runVerifier(scheme, accountId, input.reference, day, input.askStaff)
  // After the check, so a refused check sends nothing (it refuses rather than returning).
  const responseId = await answerApplication(unit, scheme, actor, input.form)
  const approving = scheme.needsApproval
  // D9: where the list sets the end date, no length is asked for.
  const endsByList = await listSetsEnd(await schemeList(scheme))
  // V2: waiting for staff is an application, pending until they pass or decline it.
  if (checked?.outcome === 'needs-staff') {
    const option = await chooseLength(scheme, input.lengthOptionId, false, endsByList)
    const membershipId = scheme.requiresPayment
      ? (await writePaying(unit, { scheme, accountId, lengthOptionId: option?.id ?? null, verified: false, approving, responseId, day })).membershipId
      : writePending(unit, { scheme, accountId, lengthOptionId: option?.id ?? null, approving, responseId })
    recordOutcome(unit, membershipId, checked)
    unit.audit({ action: 'create', record: ['membership.membership', membershipId], detail: { origin: 'applied', waiting: checked.reason } })
    return { membershipId, pending: true, waiting: checked.reason }
  }
  const pass = checked?.outcome === 'passed' && checked.entryId ? { entryId: checked.entryId, endsOn: checked.endsOn ?? null, reference: checked.reference } : null
  // D9: an entry's own end date wins, and the membership then has no length option.
  const option = pass?.endsOn ? null : await chooseLength(scheme, input.lengthOptionId, false, endsByList)
  if (scheme.requiresPayment) {
    const { membershipId, quote } = await writePaying(unit, { scheme, accountId, lengthOptionId: option?.id ?? null, verified: true, approving, responseId, day })
    if (pass) recordPass(unit, membershipId, accountId, pass)
    else if (checked) recordOutcome(unit, membershipId, checked)
    // The fee can be paid while the form's decision is awaited; it activates only once both are done.
    const waiting = approving ? 'approval' : 'payment'
    unit.audit({ action: 'create', record: ['membership.membership', membershipId], detail: { origin: 'applied', waiting } })
    return { membershipId, pending: true, waiting, amountMinor: quote.amountMinor, currency: quote.currency }
  }
  // MEM-16: waiting for the application form's decision.
  if (approving) {
    const membershipId = writePending(unit, { scheme, accountId, lengthOptionId: option?.id ?? null, verified: true, approving, responseId })
    if (pass) recordPass(unit, membershipId, accountId, pass)
    else if (checked) recordOutcome(unit, membershipId, checked)
    unit.audit({ action: 'create', record: ['membership.membership', membershipId], detail: { origin: 'applied', waiting: 'approval' } })
    return { membershipId, pending: true, waiting: 'approval' }
  }
  const written = await writeActive(unit, {
    scheme, accountId, origin: 'applied', lengthOptionId: option?.id ?? null, count: option?.count ?? 1, startsOn: day,
    ...(pass?.endsOn ? { endsOn: pass.endsOn } : {}),
  })
  if (pass) recordPass(unit, written.membershipId, accountId, pass)
  else if (checked) recordOutcome(unit, written.membershipId, checked)
  if (responseId) unit.add({ sql: 'UPDATE membership_memberships SET response_id = ? WHERE id = ?', params: [responseId, written.membershipId] })
  unit.audit({ action: 'create', record: ['membership.membership', written.membershipId], detail: { origin: 'applied' } })
  return { ...written, pending: false, opensMembersArea: scheme.side === 'members' }
}
