// A till sale split between people by item (Matt, 18 November 2026). The seller gives each item on the
// receipt to a person; nobody types an amount. The plan is fixed in the batch that makes the sale:
// each person's amount is the sum of their items, a line of several sharing its amount a penny at a
// time from the first person. Each person then pays exactly their amount, in any order, and may have
// their receipt emailed to an address of their own. A sale that is not split has one row for
// everything, so every till sale can have a receipt. Receipts go once the whole sale is paid, by a job
// the settling unit queues, one for each row with somewhere to send it, each in a unit of its own; an
// owner with something to show the buyer (Box office's tickets) adds its link to that receipt, so
// nobody gets two emails.
import { all, createUnit, first, log, newId, nowMs, refuse, type UnitView } from '#kit'
import { notify, notifyAddress } from '#modules/core'
import { unitShares } from '../shared/till'
import { getIntent, partsOf, settlements, type IntentRow, type PartRow } from './intents'
import type { SummaryLine } from './points/desk-basket'
import type { Destination, ReceiptLink, Settlement } from './points/settlement'

/** One person's share of the sale, as the till sends it: how many of each summary line are theirs. */
export interface SplitInput { items: { basket: string, line: number, quantity: number }[] }

/** What one person pays for, as stored. */
export interface SplitItem { basket: string, module: string, record: string, line: number, key: string | null, quantity: number, label: string, amountMinor: number }
export interface SplitRow { id: string, intent_id: string, position: number, amount_minor: number, items: string, attempt_id: string | null, receipt_account_id: string | null, receipt_to: string | null, receipt_sent_at: number | null }

/** One panel of the sale, as the split works it out: its summary lines and whose part it made. */
export interface SplitPanel { basket: string, owner: { module: string, record: string }, lines: SummaryLine[] }

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

/** The whole sale as one row, for a sale that is not split: every line, at its own amount. */
export function wholeSale(panels: SplitPanel[]): { position: number, amountMinor: number, items: SplitItem[] } {
  const items = panels.flatMap(p => p.lines.map((l, line) => ({ basket: p.basket, module: p.owner.module, record: p.owner.record, line, key: l.key ?? null, quantity: l.quantity ?? 1, label: l.item ?? l.label, amountMinor: l.amountMinor })))
  return { position: 0, amountMinor: items.reduce((sum, i) => sum + i.amountMinor, 0), items }
}

/** Writes the rows in the batch that makes the sale, with where the whole sale's receipt goes. */
export function addSplits(unit: UnitView, intentId: string, planned: { position: number, amountMinor: number, items: SplitItem[] }[], receipt?: Destination): void {
  const at = nowMs()
  for (const s of planned) {
    // A sale of nothing but credits, such as an exchange that gives money back, has no receipt here.
    if (s.amountMinor <= 0) continue
    const to = s.position === 0 ? receipt : undefined
    unit.add({
      sql: 'INSERT INTO payments_till_splits (id, intent_id, position, amount_minor, items, receipt_account_id, receipt_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      params: [newId('tsp'), intentId, s.position, s.amountMinor, JSON.stringify(s.items), to?.accountId ?? null, to?.email?.trim() ?? null, at],
    })
  }
}

export async function splitsOf(intentId: string): Promise<SplitRow[]> {
  return all<SplitRow>('SELECT * FROM payments_till_splits WHERE intent_id = ? AND position > 0 ORDER BY position', intentId)
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
export async function amountFor(intent: IntentRow, remaining: number, asked: { split?: number, amountMinor?: number, receipt?: Destination }): Promise<{ amountMinor: number, split: SplitRow | null, whole: SplitRow | null }> {
  const all = intent.channel === 'desk' ? await rowsOf(intent.id) : []
  const rows = all.filter(r => r.position > 0)
  if (!rows.length) {
    const whole = all.find(r => r.position === 0) ?? null
    if (asked.split !== undefined || (asked.receipt && !whole)) refuse('payments.till.not-split', 'This sale is not split between people.', { status: 422 })
    return { amountMinor: asked.amountMinor ?? remaining, split: null, whole: asked.receipt ? whole : null }
  }
  const split = rows.find(r => r.position === asked.split)
  if (!split) refuse('payments.till.which-person', 'Say which person is paying.', { status: 422, fields: { split: 'payments.till.which-person' } })
  if (split!.attempt_id && await first("SELECT 1 FROM payments_attempts WHERE id = ? AND state = 'succeeded'", split!.attempt_id))
    refuse('payments.till.person-paid', `Person ${split!.position} has already paid.`, { status: 409 })
  return { amountMinor: split!.amount_minor, split: split!, whole: null }
}

/** Where the whole sale's receipt goes, given or changed as it is paid. */
export function setReceipt(unit: UnitView, row: SplitRow, receipt: Destination): void {
  unit.add({ sql: 'UPDATE payments_till_splits SET receipt_account_id = ?, receipt_to = ? WHERE id = ? AND receipt_sent_at IS NULL', params: [receipt.accountId ?? null, receipt.email?.trim() ?? null, row.id] })
}

/** Ties the payment just added to the person it is for, with where their receipt goes. */
export function claimSplit(unit: UnitView, split: SplitRow, attemptId: string, receipt: Destination | undefined): void {
  unit.add({ sql: 'UPDATE payments_till_splits SET attempt_id = ?, receipt_account_id = ?, receipt_to = ? WHERE id = ? AND receipt_sent_at IS NULL', params: [attemptId, receipt?.accountId ?? null, receipt?.email?.trim() || null, split.id] })
    .expect(1, { code: 'payments.till.person-paid', reason: `Person ${split.position} has already paid.` })
}

const METHOD: Record<string, string> = { cash: 'Cash', card_attested: 'Card', card_reader: 'Card', card_online: 'Card', other_attested: 'Other' }
const money = (minor: number, currency: string) => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100) // not-policy: minor units to units; every currency sold here has two decimals
const destinationOf = (row: SplitRow): Destination | null => (row.receipt_account_id ? { accountId: row.receipt_account_id } : row.receipt_to ? { email: row.receipt_to } : null)

/**
 * Sends the receipts of a paid till sale that have somewhere to go and have not gone, each with any
 * owner's link for that person, and clears the address once sent. Returns how many went. The till
 * sends each in a unit of its own (payments.till-receipts), since an owner may write a good deal
 * for one person.
 */
export async function sendReceipts(unit: UnitView, intent: IntentRow, parts: PartRow[], rows: SplitRow[], handlers: Map<string, Settlement>, paidBy: Map<string, string[]>): Promise<number> {
  let sent = 0
  for (const row of rows.filter(r => r.receipt_sent_at === null && destinationOf(r))) {
    const items = JSON.parse(row.items) as SplitItem[]
    const to = destinationOf(row)!
    let link: ReceiptLink | null = null
    for (const part of parts) {
      const mine = items.filter(i => i.module === part.owner_module && i.record === part.owner_record)
      const handler = handlers.get(part.owner_module)
      if (!mine.length || !handler?.receiptLink || link) continue
      link = await handler.receiptLink(unit, { id: part.id, intentId: intent.id, record: part.owner_record, amountMinor: part.amount_minor, currency: intent.currency }, { position: row.position, to, items: mine.map(i => ({ line: i.line, key: i.key, quantity: i.quantity })) })
    }
    const methods = [...new Set((paidBy.get(row.id) ?? []).map(m => METHOD[m] ?? 'Other'))]
    const variables = {
      items: items.map(i => `${i.quantity} × ${i.label}`).join(', '),
      amount: money(row.amount_minor, intent.currency),
      method: methods.join(' and ') || 'Other',
      ...(link ? { linkText: link.label, link: link.url } : {}),
    }
    const type = link ? 'payments.till-receipt-link' : 'payments.till-receipt'
    if (to.accountId) await notify(unit, type, { to: to.accountId, variables, subject: ['payments.intent', intent.id], dedupeKey: `till-receipt:${row.id}` })
    else await notifyAddress(unit, type, { address: to.email!, variables, record: ['payments.intent', intent.id], dedupeKey: `till-receipt:${row.id}` })
    unit.add({ sql: 'UPDATE payments_till_splits SET receipt_sent_at = ?, receipt_to = NULL WHERE id = ? AND receipt_sent_at IS NULL', params: [nowMs(), row.id] }).expect(1, { code: 'payments.till.receipt-sent', reason: 'That receipt has been sent already.' })
    sent++
  }
  return sent
}

/** Sends a paid till sale's receipts, each person's in a unit of its own; throws, to be tried again, if any could not go. */
export async function sendTillReceipts(intentId: string): Promise<number> {
  const intent = await getIntent(intentId)
  if (!intent || intent.state !== 'succeeded') return 0
  const rows = await rowsOf(intentId)
  const parts = await partsOf(intentId)
  const handlers = await settlements()
  const paidBy = await paidByOf(intentId, rows)
  let sent = 0
  const failed: string[] = []
  for (const row of rows) {
    if (row.receipt_sent_at !== null || !destinationOf(row)) continue
    try {
      const unit = createUnit()
      sent += await sendReceipts(unit.view(), intent, parts, [row], handlers, paidBy)
      await unit.commit()
    }
    catch (error) {
      log.warn('payments.till-receipt-failed', { rowId: row.id, error: String((error as Error)?.message ?? error) })
      failed.push(row.id)
    }
  }
  if (failed.length) throw new Error(`${failed.length} till receipts for ${intentId} could not be sent`)
  return sent
}

/** Every row of a sale, the whole-sale row included. */
export async function rowsOf(intentId: string): Promise<SplitRow[]> {
  return all<SplitRow>('SELECT * FROM payments_till_splits WHERE intent_id = ? ORDER BY position', intentId)
}

/**
 * Who paid for each keyed line of an owner's part in a split till sale, for an owner that gives what
 * was bought to whoever paid for it (Box office's passes; Matt, 18 November). Only people who said
 * where their receipt goes can be named. Empty when the sale is not split. Reads only.
 */
export async function payersOf(intentId: string, owner: { module: string, record: string }): Promise<{ key: string, to: Destination }[]> {
  return (await rowsOf(intentId)).filter(r => r.position > 0).flatMap((row) => {
    const to = destinationOf(row)
    if (!to) return []
    return (JSON.parse(row.items) as SplitItem[]).flatMap(i => (i.key && i.module === owner.module && i.record === owner.record ? [{ key: i.key, to }] : []))
  })
}

/** How each row was paid: a person's own attempt, or every succeeded attempt for the whole sale. */
export async function paidByOf(intentId: string, rows: SplitRow[], including?: { id: string, method: string }): Promise<Map<string, string[]>> {
  const attempts = await all<{ id: string, method: string }>("SELECT id, method FROM payments_attempts WHERE intent_id = ? AND state = 'succeeded'", intentId)
  if (including && !attempts.some(a => a.id === including.id)) attempts.push(including)
  return new Map(rows.map(r => [r.id, r.position === 0 ? attempts.map(a => a.method) : attempts.filter(a => a.id === r.attempt_id).map(a => a.method)]))
}

/** What each person paid for in one owner's part, for its settle handler. Empty when not split. */
export function splitsForPart(rows: SplitRow[], owner: { module: string, record: string }): { position: number, receiptTo: string | null, receiptAccountId: string | null, items: { line: number, key: string | null, quantity: number }[] }[] {
  return rows.filter(r => r.position > 0).flatMap((r) => {
    const items = (JSON.parse(r.items) as SplitItem[]).filter(i => i.module === owner.module && i.record === owner.record)
    return items.length ? [{ position: r.position, receiptTo: r.receipt_to, receiptAccountId: r.receipt_account_id, items: items.map(i => ({ line: i.line, key: i.key, quantity: i.quantity })) }] : []
  })
}
