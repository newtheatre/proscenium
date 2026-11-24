// Approving a settlement (spec part 3, rules S7, S8 and M1): one guarded update by someone other than
// its preparer, and with Invoices off one posting keyed by the settlement, so a retry never posts twice (CO-03).
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { all, first, inAccountScope, isEnabled, newId, nowMs, refuse, useSetting } from '#kit'
import type { Actor, UnitOfWork } from '#kit'
import { postEntries } from '#modules/finance'
import type { EntryInput } from '#modules/finance'

export interface Settlement {
  id: string
  engagementId: string
  productionId: string | null
  state: string
  balanceMinor: number
  currency: string
  preparedBy: string | null
}

interface Line { kind: string, amountMinor: number }

/** Rule M5: the balance the screen showed; a different one refuses, quoting both. */
export const approveInput = z.object({ balanceMinor: z.number().int() })

export async function requireSettlement(id: string): Promise<Settlement> {
  const settlement = await first<Settlement>(`SELECT s.id, s.engagement_id AS engagementId, e.production_id AS productionId, s.state,
    s.balance_minor AS balanceMinor, s.currency, s.prepared_by AS preparedBy
    FROM companies_settlements s JOIN companies_engagements e ON e.id = s.engagement_id WHERE s.id = ?`, id)
  if (!settlement) refuse('core.not-found', 'There is no such settlement.', { status: 404 })
  return settlement
}

/** Rule M1: the debit and credit accounts for a line, by its kind and which way the money goes. */
function accountsFor(line: Line): [debit: string, credit: string] {
  if (line.kind === 'company-share' || line.kind === 'guarantee-top-up') return ['companies.company-share', 'companies.payable']
  if (line.kind === 'deposit-kept') return ['companies.deposits-held', 'companies.other-income']
  if (line.kind === 'adjustment') return line.amountMinor > 0 ? ['companies.company-share', 'companies.payable'] : ['companies.receivable', 'companies.other-income']
  return ['companies.receivable', 'companies.hire-income']
}

/** The posting's entries: one pair per line that posts, each carrying the production. */
function entriesFor(lines: Line[], productionId: string | null): EntryInput[] {
  return lines.flatMap((line) => {
    const amount = Math.abs(line.amountMinor)
    const [debit, credit] = accountsFor(line)
    return [
      { account: { key: debit }, amountMinor: amount, productionId },
      { account: { key: credit }, amountMinor: -amount, productionId },
    ]
  })
}

/**
 * Rule S7: approval needs the contact's agreement, or the wait since proposal with no query. The
 * preparer is refused on the statement itself, so the rule binds owners too (R3-17).
 */
export async function approveSettlement(unit: UnitOfWork, actor: Actor, settlement: Settlement, input: z.infer<typeof approveInput>): Promise<{ postingId: string | null }> {
  if (input.balanceMinor !== settlement.balanceMinor) {
    const say = (minor: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: settlement.currency }).format(minor / 100) // not-policy: minor units to units
    refuse('companies.settlement.balance-changed', `The balance is now ${say(settlement.balanceMinor)}, not the ${say(input.balanceMinor)} shown.`, { status: 409, remedy: 'Reload the settlement and check it again.' })
  }
  if (!['agreed', 'proposed'].includes(settlement.state))
    refuse('companies.settlement.wrong-state', `This settlement is ${settlement.state}, so it cannot be approved.`, { status: 409, remedy: 'Reload the page to see where it is now.' })
  if (settlement.preparedBy && settlement.preparedBy === actor.accountId)
    refuse('companies.settlement.own', 'You prepared this settlement, so someone else must approve it.', { status: 403, remedy: 'Ask another finance officer to approve it.' })
  const at = nowMs()
  const waitMs = (await useSetting('companies.settlements.approve-without-agreement') as number) * 1000 // not-policy: seconds to milliseconds
  const approver = actor.accountId ?? ''
  unit.add(sql`UPDATE companies_settlements SET state = 'approved', approved_by = ${actor.accountId ?? null}, updated_at = ${at}
    WHERE id = ${settlement.id} AND balance_minor = ${settlement.balanceMinor} AND (prepared_by IS NULL OR NOT ${inAccountScope('prepared_by', approver)})
    AND (state = 'agreed' OR (state = 'proposed' AND proposed_at IS NOT NULL AND proposed_at <= ${at - waitMs}))`)
    .expect(1, { code: 'companies.settlement.not-ready', reason: 'This settlement is not agreed yet, and the wait for an answer has not passed, or someone changed it just now.', remedy: 'Reload the page, and wait for the company to answer.' })
  unit.add({
    sql: `INSERT INTO companies_engagement_events (id, engagement_id, kind, from_state, to_state, detail, actor_id, at, created_at)
          VALUES (?, ?, 'settlement-approved', ?, 'approved', ?, ?, ?, ?)`,
    params: [newId('cpev'), settlement.engagementId, settlement.state, JSON.stringify({ settlementId: settlement.id, balanceMinor: settlement.balanceMinor }), actor.accountId ?? null, at, at],
  })
  unit.audit({ action: 'state', record: ['companies.settlement', settlement.id], detail: { from: settlement.state, to: 'approved' } })
  unit.announce('companies.settlement.approved', { settlementId: settlement.id, engagementId: settlement.engagementId }, { record: ['companies.settlement', settlement.id] })
  return { postingId: await post(unit, settlement) }
}

/** Rule S8: with Invoices on, Invoicing posts when it issues; with it off, Companies posts here, once. */
async function post(unit: UnitOfWork, settlement: Settlement): Promise<string | null> {
  if (await isEnabled('invoicing')) return null
  const lines = await all<Line>('SELECT kind, amount_minor AS amountMinor FROM companies_settlement_lines WHERE settlement_id = ? AND posts = 1 AND amount_minor <> 0 ORDER BY sort, id', settlement.id)
  if (!lines.length) return null
  const postingId = await postEntries(unit, {
    key: `companies:settlement:${settlement.id}:approved`,
    source: { module: 'companies', type: 'settlement', id: settlement.id },
    kind: 'recognition',
    currency: settlement.currency,
    entries: entriesFor(lines, settlement.productionId),
  })
  unit.add({ sql: 'UPDATE companies_settlements SET posting_id = ? WHERE id = ? AND posting_id IS NULL', params: [postingId, settlement.id] }).expect(1)
  return postingId
}
