// A till sale split between people by item (Matt, 18 November 2026). The seller gives each item on the
// receipt to a person; nobody types an amount. The plan is fixed in the batch that makes the sale:
// each person's amount is the sum of their items, a line of several sharing its amount a penny at a
// time from the first person. Each person then pays exactly their amount, in any order, and may have
// their receipt emailed to an address of their own once their payment succeeds.
import { all, first, log, newId, nowMs, refuse, type UnitView } from '#kit'
import { notifyAddress } from '#modules/core'
import type { AttemptRow } from './answers'
import type { IntentRow } from './intents'
import type { SummaryLine } from './points/desk-basket'

/** One person's share of the sale, as the till sends it: how many of each summary line are theirs. */
export interface SplitInput { items: { basket: string, line: number, quantity: number }[] }

/** What one person pays for, as stored. */
export interface SplitItem { basket: string, module: string, record: string, line: number, key: string | null, quantity: number, label: string, amountMinor: number }
export interface SplitRow { id: string, intent_id: string, position: number, amount_minor: number, items: string, attempt_id: string | null, receipt_to: string | null, receipt_sent_at: number | null }

/** One panel of the sale, as the split works it out: its summary lines and whose part it made. */
export interface SplitPanel { basket: string, owner: { module: string, record: string }, lines: SummaryLine[] }

/** The amount of each of a line's `quantity` units, the first ones taking the odd pennies. */
export function unitShares(amountMinor: number, quantity: number): number[] {
  const each = Math.floor(amountMinor / quantity)
  const over = amountMinor - each * quantity
  return Array.from({ length: quantity }, (_, i) => each + (i < over ? 1 : 0))
}

/** How many separate things a sale holds: a split needs at least two. */
export const itemCount = (panels: Pick<SplitPanel, 'lines'>[]) => panels.reduce((n, p) => n + p.lines.reduce((m, l) => m + (l.quantity ?? 1), 0), 0)

const BAD = (reason: string) => refuse('payments.till.bad-split', reason, { status: 422, remedy: 'Give every item on the receipt to one person, then take payment again.' })

/**
 * Works out each person's items and amount, refusing a plan that leaves an item out, gives one twice,
 * or leaves a person with nothing to pay. People are numbered in the order given.
 */
export function planSplits(panels: SplitPanel[], splits: SplitInput[]): { position: number, amountMinor: number, items: SplitItem[] }[] {
  if (splits.length < 2) BAD('A split needs at least two people.')
  if (itemCount(panels) < 2) refuse('payments.till.split-one-item', 'There is only one item, so it cannot be split.', { status: 422 })
  const byBasket = new Map(panels.map(p => [p.basket, p]))
  // For each line, the units still to give, handed out in the order the people come.
  const left = new Map<string, number[]>()
  for (const p of panels) {
    p.lines.forEach((l, i) => {
      const quantity = l.quantity ?? 1
      if (!Number.isSafeInteger(quantity) || quantity < 1) BAD(`${l.label} has no items to give.`)
      if (l.amountMinor < 0) refuse('payments.till.split-credit', 'A sale with money going back cannot be split.', { status: 422 })
      left.set(`${p.basket} ${i}`, unitShares(l.amountMinor, quantity))
    })
  }
  const planned = splits.map((s, n) => {
    const items: SplitItem[] = []
    for (const asked of s.items) {
      const panel = byBasket.get(asked.basket)
      const line = panel?.lines[asked.line]
      const shares = left.get(`${asked.basket} ${asked.line}`)
      if (!panel || !line || !shares) BAD('One of the items is not in this sale.')
      if (asked.quantity > shares!.length) BAD(`${line!.label} is given out more times than it is on the receipt.`)
      const taken = shares!.splice(0, asked.quantity)
      items.push({ basket: panel!.basket, module: panel!.owner.module, record: panel!.owner.record, line: asked.line, key: line!.key ?? null, quantity: asked.quantity, label: line!.item ?? line!.label, amountMinor: taken.reduce((sum, a) => sum + a, 0) })
    }
    const amountMinor = items.reduce((sum, i) => sum + i.amountMinor, 0)
    if (!items.length || amountMinor <= 0) BAD(`Person ${n + 1} has nothing to pay for.`)
    return { position: n + 1, amountMinor, items }
  })
  if ([...left.values()].some(l => l.length)) BAD('Some items are not given to anyone.')
  return planned
}

/** Writes the plan in the batch that makes the sale. */
export function addSplits(unit: UnitView, intentId: string, planned: ReturnType<typeof planSplits>): void {
  const at = nowMs()
  for (const s of planned) {
    unit.add({
      sql: 'INSERT INTO payments_till_splits (id, intent_id, position, amount_minor, items, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [newId('tsp'), intentId, s.position, s.amountMinor, JSON.stringify(s.items), at],
    })
  }
}

export async function splitsOf(intentId: string): Promise<SplitRow[]> {
  return all<SplitRow>('SELECT * FROM payments_till_splits WHERE intent_id = ? ORDER BY position', intentId)
}

/** Each person's share, with whether it is paid, for the till. Empty for a sale that is not split. */
export async function splitStatus(intentId: string): Promise<{ position: number, amountMinor: number, items: { label: string, quantity: number, amountMinor: number }[], paid: boolean }[]> {
  const rows = await splitsOf(intentId)
  if (!rows.length) return []
  const paid = new Set((await all<{ id: string }>("SELECT id FROM payments_attempts WHERE intent_id = ? AND state = 'succeeded'", intentId)).map(a => a.id))
  return rows.map(r => ({
    position: r.position,
    amountMinor: r.amount_minor,
    items: (JSON.parse(r.items) as SplitItem[]).map(i => ({ label: i.label, quantity: i.quantity, amountMinor: i.amountMinor })),
    paid: !!r.attempt_id && paid.has(r.attempt_id),
  }))
}

/**
 * The amount to take for a payment on this intent. A split sale is paid one person at a time, each
 * for exactly their share; a sale that is not split is paid whole, unless the caller is Payments' own
 * code asking for less (a typed amount is never taken from the till).
 */
export async function amountFor(intent: IntentRow, remaining: number, asked: { split?: number, amountMinor?: number, receiptTo?: string }): Promise<{ amountMinor: number, split: SplitRow | null }> {
  const rows = intent.channel === 'desk' ? await splitsOf(intent.id) : []
  if (!rows.length) {
    if (asked.split !== undefined || asked.receiptTo !== undefined) refuse('payments.till.not-split', 'This sale is not split between people.', { status: 422 })
    return { amountMinor: asked.amountMinor ?? remaining, split: null }
  }
  const split = rows.find(r => r.position === asked.split)
  if (!split) refuse('payments.till.which-person', 'Say which person is paying.', { status: 422, fields: { split: 'payments.till.which-person' } })
  if (split!.attempt_id && await first("SELECT 1 FROM payments_attempts WHERE id = ? AND state = 'succeeded'", split!.attempt_id))
    refuse('payments.till.person-paid', `Person ${split!.position} has already paid.`, { status: 409 })
  return { amountMinor: split!.amount_minor, split: split! }
}

/** Ties the payment just added to the person it is for, with where their receipt goes. */
export function claimSplit(unit: UnitView, split: SplitRow, attemptId: string, receiptTo: string | undefined): void {
  unit.add({ sql: 'UPDATE payments_till_splits SET attempt_id = ?, receipt_to = ? WHERE id = ? AND receipt_sent_at IS NULL', params: [attemptId, receiptTo?.trim() || null, split.id] })
    .expect(1, { code: 'payments.till.person-paid', reason: `Person ${split.position} has already paid.` })
}

const METHOD: Record<string, string> = { cash: 'Cash', card_attested: 'Card', card_reader: 'Card', card_online: 'Card', other_attested: 'Other' }
const money = (minor: number, currency: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100) // not-policy: minor units to units; every currency sold here has two decimals

/**
 * A person's payment has succeeded: their receipt goes to the address they gave, in the same unit as
 * the answer, so it goes exactly when the payment holds. A receipt that cannot be prepared is logged
 * and left out: the payment still stands.
 */
export async function sendSplitReceipt(unit: UnitView, attempt: AttemptRow, currency: string): Promise<void> {
  const split = await first<SplitRow>('SELECT * FROM payments_till_splits WHERE attempt_id = ?', attempt.id)
  if (!split || !split.receipt_to || split.receipt_sent_at !== null) return
  const items = (JSON.parse(split.items) as SplitItem[]).map(i => `${i.quantity} × ${i.label}`).join(', ')
  try {
    await notifyAddress(unit, 'payments.till-receipt', {
      address: split.receipt_to,
      variables: { items, amount: money(split.amount_minor, currency), method: METHOD[attempt.method] ?? 'Other' },
      record: ['payments.intent', split.intent_id],
      dedupeKey: `till-receipt:${split.id}`,
    })
    unit.add({ sql: 'UPDATE payments_till_splits SET receipt_sent_at = ? WHERE id = ?', params: [nowMs(), split.id] })
  }
  catch (error) {
    log.warn('payments.till-receipt-failed', { splitId: split.id, error: String((error as Error)?.message ?? error) })
  }
}

/** What each person paid for in one owner's part, for its settle handler. Empty when not split. */
export function splitsForPart(rows: SplitRow[], owner: { module: string, record: string }): { position: number, receiptTo: string | null, items: { line: number, key: string | null, quantity: number }[] }[] {
  return rows.flatMap((r) => {
    const items = (JSON.parse(r.items) as SplitItem[]).filter(i => i.module === owner.module && i.record === owner.record)
    return items.length ? [{ position: r.position, receiptTo: r.receipt_to, items: items.map(i => ({ line: i.line, key: i.key, quantity: i.quantity })) }] : []
  })
}
