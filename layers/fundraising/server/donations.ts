// Donations in the console (FR-17, screens C2 and C3): newest first, searched by reference or donor,
// filtered by fund and state. Pending and abandoned gifts show only when asked for: they are tries,
// not gifts. Reading them is audited by the ability.
import { z } from 'zod'
import { all, first, refuse } from '#kit'
import { DONATION_STATES } from './db/schema'

export const donationQuery = z.object({
  q: z.string().trim().max(120).optional(), // not-policy: shape bound
  fundId: z.string().optional(),
  state: z.enum(DONATION_STATES).optional(),
}).strict()

export interface DonationLine { id: string, reference: string | null, donor: string | null, amountMinor: number, refundedMinor: number, currency: string, fund: string, channel: string, state: string, receivedOn: string | null, giftAid: string }
export interface Donation extends DonationLine {
  fundId: string
  accountId: string | null
  email: string | null
  acknowledgeAs: string | null
  message: string | null
  intentId: string | null
  giftAidReason: string | null
  createdAt: number
}

const DONOR = 'coalesce(d.donor_name, d.organisation_name, a.name, d.contact_email)'
const LINE = `d.id, d.reference, ${DONOR} AS donor, d.amount_minor AS amountMinor, d.refunded_minor AS refundedMinor, d.currency,
  f.name AS fund, d.channel, d.state, d.received_on AS receivedOn, d.gift_aid AS giftAid`
const FROM = 'FROM fundraising_donations d JOIN fundraising_funds f ON f.id = d.fund_id LEFT JOIN core_accounts a ON a.id = d.account_id'
const PAGE = 200 // not-policy: one screen of a list, searched for the rest

export async function listDonations(query: z.infer<typeof donationQuery>): Promise<DonationLine[]> {
  const like = query.q ? `%${query.q.toLowerCase()}%` : null
  return all<DonationLine>(
    `SELECT ${LINE} ${FROM}
      WHERE (? IS NULL OR lower(coalesce(d.reference, '')) LIKE ? OR lower(coalesce(${DONOR}, '')) LIKE ?)
        AND (? IS NULL OR d.fund_id = ?)
        AND (CASE WHEN ? IS NULL THEN d.state IN ('received', 'refunded') ELSE d.state = ? END)
      ORDER BY coalesce(d.received_on, '') DESC, d.created_at DESC LIMIT ${PAGE}`,
    like, like, like, query.fundId ?? null, query.fundId ?? null, query.state ?? null, query.state ?? null,
  )
}

export async function getDonation(id: string): Promise<Donation> {
  const row = await first<Donation>(
    `SELECT ${LINE}, d.fund_id AS fundId, d.account_id AS accountId, d.contact_email AS email, d.acknowledge_as AS acknowledgeAs,
       d.message, d.intent_id AS intentId, d.gift_aid_reason AS giftAidReason, d.created_at AS createdAt ${FROM} WHERE d.id = ?`, id)
  return row ?? refuse('core.not-found', 'There is no gift with that reference.', { status: 404 })
}
