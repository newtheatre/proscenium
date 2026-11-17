// Taking a fee at the desk (rule P8): somebody whose application waits only for its fee pays it in
// the till, alone or with tickets in the same payment. The panel names one charge; preparing it marks
// the charge as being paid at the desk, and the settlement handler activates the membership in
// Payments' batch as it does for a payment online. A payment that ends without the money leaves the
// charge open again, so it can be paid online or at the desk later.
import { z } from 'zod'
import { all, first, nowMs, refuse, requireAbility, useContext, useSetting, type UnitView } from '#kit'
import { intentStatus, type DeskContext } from '#modules/payments'

const input = z.object({ chargeId: z.string().min(1).max(64), expectedAmountMinor: z.number().int().min(1) }).strict() // not-policy: shape bound

export interface WaitingFee { chargeId: string, membershipId: string, accountName: string | null, schemeName: string, lengthName: string | null, amountMinor: number, currency: string, appliedAt: number, beingPaid: boolean }

const WAITING = `SELECT c.id AS chargeId, m.id AS membershipId, a.name AS accountName, s.name AS schemeName, o.name AS lengthName,
         c.amount_minor AS amountMinor, c.currency, m.created_at AS appliedAt, c.intent_id AS intentId
    FROM membership_fees_charges c
    JOIN membership_memberships m ON m.id = c.membership_id
    JOIN membership_schemes s ON s.id = m.scheme_id
    JOIN core_accounts a ON a.id = m.account_id
    LEFT JOIN membership_length_options o ON o.id = m.length_option_id
   WHERE c.state = 'open' AND m.state = 'pending' AND NOT (m.needs_verification = 1 AND m.verified_at IS NULL)`

type WaitingRow = Omit<WaitingFee, 'beingPaid'> & { intentId: string | null }

async function shaped(row: WaitingRow): Promise<WaitingFee> {
  const { intentId, ...rest } = row
  return { ...rest, beingPaid: !!intentId && (await intentStatus(intentId))?.state === 'open' }
}

/** Applications waiting only for their fee, found by the holder's name or an address of theirs. */
export async function waitingFees(query: string): Promise<WaitingFee[]> {
  const q = query.trim()
  const rows = q
    ? await all<WaitingRow>(`${WAITING} AND (a.name LIKE ?1 OR a.preferred_name LIKE ?1 OR EXISTS (SELECT 1 FROM core_account_emails e WHERE e.account_id = a.id AND e.address LIKE ?1)) ORDER BY m.created_at DESC, m.id LIMIT 25`, `%${q}%`) // not-policy: a page of matches
    : await all<WaitingRow>(`${WAITING} ORDER BY m.created_at DESC, m.id LIMIT 25`) // not-policy: a page of matches
  return Promise.all(rows.map(shaped))
}

function panelInput(value: unknown): z.infer<typeof input> {
  const parsed = input.safeParse(value)
  if (!parsed.success) refuse('membership-fees.desk.bad-input', 'The membership panel was not filled in properly.', { status: 422 })
  return parsed.data!
}

/** The charge, if it is waiting for its fee and may be paid at the desk now. */
async function waiting(chargeId: string): Promise<WaitingFee> {
  if (await useSetting('membership-fees.desk.enabled') === false) refuse('membership-fees.desk.off', 'Membership fees are not taken at the desk here.', { status: 409 })
  const row = await first<WaitingRow>(`${WAITING} AND c.id = ?`, chargeId)
  if (!row) refuse('membership-fees.desk.not-waiting', 'This membership is not waiting for its fee.', { status: 409, remedy: 'Find it again.' })
  const fee = await shaped(row!)
  if (fee.beingPaid) refuse('membership-fees.desk.being-paid', 'A payment for this fee is already being taken.', { status: 409, remedy: 'Wait for it to finish, or try again once it has.' })
  return fee
}

/** The panel's line, for the till to show. Reads only. */
export async function deskSummary(context: DeskContext): Promise<{ lines: { label: string, amountMinor: number }[], amountMinor: number }> {
  const fee = await waiting(panelInput(context.input).chargeId)
  return { lines: [{ label: fee.lengthName ? `${fee.schemeName}, ${fee.lengthName}` : fee.schemeName, amountMinor: fee.amountMinor }], amountMinor: fee.amountMinor }
}

/** Names the charge as this payment's part. The charge itself changes only in attach, once the intent exists. */
export async function deskPrepare(_unit: UnitView, context: DeskContext): Promise<{ owner: { module: string, record: string }, amountMinor: number }> {
  const { chargeId, expectedAmountMinor } = panelInput(context.input)
  await requireAbility(useContext().actor, 'membership-fees.payment.take', ['membership-fees.charge', chargeId])
  const fee = await waiting(chargeId)
  if (fee.amountMinor !== expectedAmountMinor) refuse('membership-fees.desk.amount-changed', 'The fee for this membership has changed.', { status: 409, remedy: 'Find it again and check what is due.' })
  return { owner: { module: 'membership-fees', record: chargeId }, amountMinor: fee.amountMinor }
}

/** Puts the till's payment on the charge, so settling knows it, and records that it was paid at the desk. */
export function deskAttach(unit: UnitView, chargeId: string, intentId: string): void {
  // An intent that ended without its release having run leaves its id behind; one still open was refused in prepare.
  unit.add({ sql: "UPDATE membership_fees_charges SET intent_id = ?, channel = 'desk', updated_at = ? WHERE id = ? AND state = 'open'", params: [intentId, nowMs(), chargeId] })
    .expect(1, { code: 'membership-fees.desk.not-waiting', reason: 'This membership is not waiting for its fee.' })
}
