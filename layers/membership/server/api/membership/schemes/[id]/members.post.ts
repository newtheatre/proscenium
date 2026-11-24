// Staff add a member directly (MEM-24; rules G1 to G4): pick a person, or give a name and address,
// which finds the account that has it or makes an unclaimed one. The membership is active at once;
// staff may set either date by hand (D7). Nobody adds themselves. For a scheme that requires payment,
// while the fees module is on, staff choose (P9): send the person a link to pay, so the membership
// waits as pending until they do; or waive the fee with a reason, which needs
// membership-fees.charge.waive. Taking the fee at the desk is a later slice.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { can, defineRoute, first, ownRecordExempt, refuse, siteUrl, today } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { findOrCreateAccount, notify } from '#modules/core'
import { charger } from '../../../../charge'
import { endsOnFor } from '../../../../dates'
import { chooseLength, writePaying } from '../../../../joining'
import { schemeList } from '../../../../lists'
import { holdsScheme, writeActive } from '../../../../memberships'
import { requireScheme } from '../../../../schemes'
import { passList, recordPass, type ListPass } from '../../../../verify'

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: the shape of a date

export default defineRoute({
  ability: 'membership.membership.add',
  record: event => ['membership.scheme', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    accountId: z.string().optional(),
    name: z.string().trim().min(1).max(120).optional(), // not-policy: a person's name's bound
    address: z.string().trim().email().max(254).optional(), // not-policy: an address's bound
    lengthOptionId: z.string().nullish(),
    startsOn: DATE.optional(),
    endsOn: DATE.nullish(),
    note: z.string().trim().max(1000).optional(), // not-policy: the specification's bound
    // For a scheme checked against a list of references (a student ID): the reference to check and claim.
    reference: z.string().trim().max(60).optional(), // not-policy: a reference's bound
    // P9, for a scheme that requires payment: send a link to pay, or waive the fee.
    fee: z.enum(['link', 'waive']).optional(),
  }).refine(i => !!i.accountId !== !!i.address, { message: 'Pick a person or give an address', path: ['accountId'] }),
}, async (_event, { input, actor, record, unit }) => {
  const scheme = await requireScheme(record!.id)
  if (scheme.state !== 'open') refuse('membership.scheme.not-open', 'Members can be added only to an open scheme.', { status: 409 })
  let accountId = input.accountId
  if (accountId) {
    if (!(await first('SELECT 1 FROM core_accounts WHERE id = ? AND anonymised_at IS NULL', accountId))) refuse('core.not-found', 'There is no such person.', { status: 404 })
  }
  else {
    accountId = (await findOrCreateAccount(unit, { address: input.address!, name: input.name, origin: 'staff' })).accountId
  }
  // G3: never one's own account, whichever account in a merge it is; an Owner has nobody else to ask.
  if (actor.accountId && await first(`SELECT 1 WHERE ?1 IN (${accountScopeSql('?2')})`, accountId, actor.accountId) && !(await ownRecordExempt(actor)))
    refuse('membership.membership.own', 'You cannot add a membership to your own account.', { status: 403, remedy: 'Ask another membership officer.' })
  // A reference on a scheme checked against a list is checked and claimed like a member joining (V4); the entry's end date is used unless staff set one (D9).
  const list = input.reference ? await schemeList(scheme) : null
  const pass: ListPass | null = list && list.keyKind === 'reference' ? await passList(list, accountId, input.reference, await today()) : null
  const entryEnds = pass?.endsOn && input.endsOn === undefined ? pass.endsOn : undefined
  // Staff who give both dates need no length; withdrawn lengths are never offered.
  const option = !input.lengthOptionId && ((input.startsOn && input.endsOn) || entryEnds) ? null : await chooseLength(scheme, input.lengthOptionId)
  // S5 lets staff add a member to a paid scheme while the fees module is off, as before.
  const fees = scheme.requiresPayment ? await charger() : null
  if (fees) {
    if (!input.fee) refuse('membership.add.fee-choice', 'Choose whether to send a link to pay or to waive the fee.', { status: 422, fields: { fee: 'membership.add.fee-choice' } })
    if (input.fee === 'waive' && !(await can(actor, 'membership-fees.charge.waive')).allowed)
      refuse('membership.add.cannot-waive', 'You cannot waive a fee.', { status: 403, remedy: 'Send a link to pay instead, or ask somebody who may waive fees.' })
    if (input.fee === 'waive' && !input.note) refuse('membership.add.waive-reason', 'Say why the fee is waived.', { status: 422, fields: { note: 'membership.add.waive-reason' } })
  }
  if (fees && input.fee === 'link') {
    // The membership starts when it is paid, so its dates are worked out then.
    if (input.startsOn || input.endsOn !== undefined) refuse('membership.add.dates-with-link', 'A membership waiting for its fee starts when it is paid, so its dates cannot be set now.', { status: 422, remedy: 'Add it without dates, or waive the fee.' })
    if (await holdsScheme(accountId, scheme.id)) refuse('membership.membership.already-held', 'This person already holds this scheme.', { status: 409, remedy: 'Change the dates of their membership instead.' })
    const day = await today()
    const { membershipId, quote } = await writePaying(unit, { scheme, accountId, lengthOptionId: option?.id ?? null, verified: true, day })
    const amount = new Intl.NumberFormat('en-GB', { style: 'currency', currency: quote.currency }).format(quote.amountMinor / 100) // not-policy: minor units to units
    // The link is the address of their own application page: it carries no token, and asks them to sign in.
    await notify(unit, 'membership.pay-link', { to: accountId, variables: { scheme: scheme.name, amount, link: await siteUrl(`/account/membership/${membershipId}/pay`) }, subject: ['membership.membership', membershipId], dedupeKey: `pay-link:${membershipId}` })
    unit.audit({ action: 'create', record: ['membership.membership', membershipId], detail: { origin: 'added', waiting: 'payment' } })
    if (pass) recordPass(unit, membershipId, accountId, pass)
    return { membershipId, accountId, pending: true, waiting: 'payment', amountMinor: quote.amountMinor, currency: quote.currency }
  }
  const startsOn = input.startsOn ?? await today()
  const endsOn = input.endsOn !== undefined ? input.endsOn : entryEnds ?? endsOnFor(scheme, startsOn, option?.count ?? 1)
  if (endsOn && endsOn < startsOn) refuse('membership.membership.dates', 'The end date cannot be before the start.', { status: 422, fields: { endsOn: 'membership.membership.dates' } })
  if (await holdsScheme(accountId, scheme.id, startsOn) && !input.startsOn)
    refuse('membership.membership.already-held', 'This person already holds this scheme.', { status: 409, remedy: 'Change the dates of their membership instead.' })
  const written = await writeActive(unit, { scheme, accountId, origin: 'added', lengthOptionId: option?.id ?? null, count: option?.count ?? 1, startsOn, endsOn, addedBy: actor.accountId ?? null, note: input.note ?? null })
  if (pass) recordPass(unit, written.membershipId, accountId, pass)
  // G2 and D7: verification and approval are taken as given by the member of staff; both sets of dates are kept.
  unit.audit({ action: 'create', record: ['membership.membership', written.membershipId], detail: { origin: 'added', calculatedEndsOn: endsOnFor(scheme, startsOn, option?.count ?? 1), endsOn, ...(fees ? { fee: 'waived' } : {}) } })
  return { ...written, accountId, opensMembersArea: scheme.side === 'members' }
})
