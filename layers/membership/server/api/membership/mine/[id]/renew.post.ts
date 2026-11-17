// Renewing one's own membership (R1 to R7): applying again for the same scheme, with renews_id set.
// Inside the window it follows on the day after the old one ends; after the end, until grace runs
// out, it starts today. A second press returns the first renewal (R3). The check runs again only
// where the scheme says so (V6), and may send the renewal to staff like an application. A renewal of
// a paid scheme waits for its fee at the renewal price (P1) and starts when paid (A1).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, refuse, today } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { requireCharger } from '../../../../charge'
import { chooseLength, writePaying } from '../../../../joining'
import { writeActive, writePending } from '../../../../memberships'
import { renewalStarts, renewalWindow } from '../../../../renewal'
import { requireScheme } from '../../../../schemes'
import { recordOutcome, recordPass, runVerifier } from '../../../../verify'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    lengthOptionId: z.string().nullish(),
    reference: z.string().trim().max(254).nullish(), // not-policy: an address's bound
  }),
}, async (event, { input, actor, unit }) => {
  const id = getRouterParam(event, 'id')!
  const accountId = actor.accountId!
  const old = await first<{ scheme_id: string, ends_on: string | null }>(
    `SELECT scheme_id, ends_on FROM membership_memberships WHERE id = ?1 AND state = 'active' AND account_id IN (${accountScopeSql('?2')})`, id, accountId,
  )
  if (!old) refuse('core.not-found', 'You have no membership with that reference.', { status: 404 })
  const scheme = await requireScheme(old!.scheme_id)
  // R3: renewed once.
  const earlier = await first<{ id: string, state: string }>('SELECT id, state FROM membership_memberships WHERE renews_id = ? AND state IN (\'pending\', \'active\')', id)
  if (earlier) return { membershipId: earlier.id, pending: earlier.state === 'pending', renewed: true }
  // R6, R7.
  if (scheme.state === 'archived') refuse('membership.renew.archived', 'This scheme is no longer offered, so it cannot be renewed.', { status: 409 })
  const window = renewalWindow(old!.ends_on, scheme)
  if (!window) refuse('membership.renew.not-offered', 'This membership is not renewed.', { status: 409 })
  const day = await today()
  if (day < window!.opensOn) refuse('membership.renew.not-yet', `Renewal opens on ${window!.opensOn}.`, { status: 409 })
  if (day > window!.closesOn) refuse('membership.renew.too-late', 'This membership has lapsed, so it cannot be renewed.', { status: 409, remedy: 'Join the scheme again.' })

  if (scheme.requiresPayment) await requireCharger()
  const startsOn = renewalStarts(old!.ends_on!, day)
  const checked = scheme.reverifyOnRenewal ? await runVerifier(scheme, accountId, input.reference, day) : null
  if (checked?.outcome === 'needs-staff') {
    const option = await chooseLength(scheme, input.lengthOptionId)
    const membershipId = scheme.requiresPayment
      ? (await writePaying(unit, { scheme, accountId, lengthOptionId: option?.id ?? null, renewsId: id, verified: false, day })).membershipId
      : writePending(unit, { scheme, accountId, lengthOptionId: option?.id ?? null, renewsId: id })
    recordOutcome(unit, membershipId, checked)
    unit.audit({ action: 'create', record: ['membership.membership', membershipId], detail: { origin: 'renewed', waiting: checked.reason } })
    return { membershipId, pending: true, renewed: true }
  }
  const pass = checked?.outcome === 'passed' && checked.entryId ? { entryId: checked.entryId, endsOn: checked.endsOn ?? null } : null
  const option = pass?.endsOn ? null : await chooseLength(scheme, input.lengthOptionId)
  if (scheme.requiresPayment) {
    const { membershipId, quote } = await writePaying(unit, { scheme, accountId, lengthOptionId: option?.id ?? null, renewsId: id, verified: true, day })
    if (pass) recordPass(unit, membershipId, accountId, pass)
    else if (checked) recordOutcome(unit, membershipId, checked)
    unit.audit({ action: 'create', record: ['membership.membership', membershipId], detail: { origin: 'renewed', waiting: 'payment' } })
    return { membershipId, pending: true, renewed: true, waiting: 'payment', amountMinor: quote.amountMinor, currency: quote.currency }
  }
  const written = await writeActive(unit, {
    scheme, accountId, origin: 'renewed', renewsId: id, lengthOptionId: option?.id ?? null, count: option?.count ?? 1, startsOn,
    ...(pass?.endsOn ? { endsOn: pass.endsOn } : {}),
  })
  if (pass) recordPass(unit, written.membershipId, accountId, pass)
  else if (checked) recordOutcome(unit, written.membershipId, checked)
  unit.audit({ action: 'create', record: ['membership.membership', written.membershipId], detail: { origin: 'renewed' } })
  return { ...written, pending: false, renewed: true }
})
