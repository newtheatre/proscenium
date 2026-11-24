// Sending an invoice out and its reminders (rules I-17, I-18, I-31 to I-35). The link opens the
// public invoice page without signing in. Only its hash is kept; the token itself is derived from the
// invoice and the link's expiry, so every message sent while the link lasts carries the same one, and
// a send after it lapses makes a new link and the old one dies.
import { all, first, linkTokens, newId, nowMs, refuse, siteUrl, theatreTimeZone, today, useSetting, type UnitView } from '#kit'
import { localParts, previousDate } from '#kit/clock'
import { notifyAddress } from '#modules/core'
import { requireInvoice, type Invoice } from './invoices'
import { formatDay, formatMoney } from './money'
import { makePdf } from './document'

export type SendStep = 'sent' | 'before-due' | 'overdue-1' | 'overdue-2' | 'manual'
const SECOND = 1000 // not-policy: durations are settings in seconds

const tokenFor = (invoiceId: string, expiresAt: number) => linkTokens.hash(`invoicing.pay:${invoiceId}:${expiresAt}`)

/** The link's token for this send: the current one while it lasts, otherwise a new one kept in the unit. */
async function linkFor(unit: UnitView, invoice: Invoice): Promise<string> {
  const row = await first<{ expiresAt: number | null }>('SELECT pay_token_expires_at AS expiresAt FROM invoicing_invoices WHERE id = ?', invoice.id)
  const at = nowMs()
  if (row?.expiresAt && row.expiresAt > at) return tokenFor(invoice.id, row.expiresAt)
  const expiresAt = at + (await useSetting('invoicing.pay.link-valid-for') as number) * SECOND
  const token = await tokenFor(invoice.id, expiresAt)
  unit.add({ sql: 'UPDATE invoicing_invoices SET pay_token_hash = ?, pay_token_expires_at = ? WHERE id = ?', params: [await linkTokens.hash(token), expiresAt, invoice.id] })
  return token
}

/** Emails the invoice, or a reminder of it, to its address, and records the step (I-17, I-35). */
export async function sendInvoice(unit: UnitView, invoice: Invoice, step: SendStep, by: string | null): Promise<void> {
  if (invoice.direction !== 'out' || invoice.state === 'draft' || invoice.state === 'submitted') refuse('invoicing.invoice.not-issued', 'Only an issued invoice can be sent.', { status: 409 })
  if (!invoice.billToEmail) refuse('invoicing.invoice.no-email', 'This invoice has no email address to send it to.', { status: 409, remedy: 'Print the PDF and post it instead.' })
  const token = await linkFor(unit, invoice)
  const outstanding = invoice.totalMinor - invoice.allocatedMinor
  const { notificationId } = await notifyAddress(unit, step === 'sent' ? 'invoicing.invoice' : 'invoicing.reminder', {
    address: invoice.billToEmail!,
    variables: {
      number: invoice.number!,
      amount: await formatMoney(step === 'sent' ? invoice.totalMinor : outstanding, invoice.currency),
      due: await formatDay(invoice.dueOn!),
      link: await siteUrl(`/invoice/${token}`),
    },
    dedupeKey: step === 'manual' ? `invoicing:${invoice.id}:manual:${newId('ivn')}` : `invoicing:${invoice.id}:${step}`,
    record: ['invoicing.invoice', invoice.id],
  })
  unit.add({
    sql: 'INSERT INTO invoicing_reminders (id, invoice_id, step, notification_id, sent_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    params: [newId('ivn'), invoice.id, step, notificationId, by, nowMs()],
  })
}

/** The job after issue: the PDF first, then the email when it was asked for and there is an address (I-16). */
export async function afterIssue(unit: UnitView, input: { invoiceId: string, send: boolean, byId: string | null }): Promise<void> {
  await makePdf(unit, input.invoiceId)
  const invoice = await requireInvoice(input.invoiceId)
  const sent = await first('SELECT id FROM invoicing_reminders WHERE invoice_id = ? AND step = \'sent\'', invoice.id)
  if (input.send && invoice.billToEmail && invoice.state === 'open' && !sent) await sendInvoice(unit, invoice, 'sent', input.byId)
}

/** Sends by hand: the invoice itself if it never went, otherwise a reminder. */
export async function sendByHand(unit: UnitView, invoice: Invoice, by: string): Promise<SendStep> {
  const sent = await first('SELECT id FROM invoicing_reminders WHERE invoice_id = ? AND step = \'sent\'', invoice.id)
  const step: SendStep = sent ? 'manual' : 'sent'
  if (step === 'manual' && invoice.state !== 'open') refuse('invoicing.invoice.nothing-owed', 'Nothing is owed on this invoice, so there is nothing to remind them of.', { status: 409 })
  await sendInvoice(unit, invoice, step, by)
  return step
}

const STEPS: SendStep[] = ['before-due', 'overdue-1', 'overdue-2']
const DAY = 86_400 // not-policy: seconds in a day
const after = (date: string, days: number) => previousDate(date, -days)

/** Which scheduled step is due for an invoice falling due on `dueOn`, judged on `on`; null for none (I-31). */
export function stepDue(dueOn: string, on: string, days: { before: number, first: number, second: number }): SendStep | null {
  if (on >= after(dueOn, days.second)) return 'overdue-2'
  if (on >= after(dueOn, days.first)) return 'overdue-1'
  if (days.before > 0 && on >= after(dueOn, -days.before) && on <= dueOn) return 'before-due'
  return null
}

/** The hourly task: once the day's sending time has passed, each open invoice's step that is due, once. */
export async function sendReminders(unit: UnitView): Promise<number> {
  if (await useSetting('invoicing.reminders.enabled') !== true) return 0
  const parts = localParts(nowMs(), await theatreTimeZone())
  if (`${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}` < (await useSetting('invoicing.reminders.send-at') as string)) return 0
  const on = await today()
  const days = {
    before: Math.floor((await useSetting('invoicing.reminders.before-due') as number) / DAY),
    first: Math.floor((await useSetting('invoicing.reminders.first-after') as number) / DAY),
    second: Math.floor((await useSetting('invoicing.reminders.second-after') as number) / DAY),
  }
  // Only invoices that went by email are chased; one marked to send by hand waits for a person.
  const open = await all<{ id: string, dueOn: string, steps: string | null }>(
    `SELECT i.id, i.due_on AS dueOn, (SELECT group_concat(r.step) FROM invoicing_reminders r WHERE r.invoice_id = i.id) AS steps
      FROM invoicing_invoices i WHERE i.direction = 'out' AND i.state = 'open' AND i.reminders_on = 1 AND i.bill_to_email IS NOT NULL
      AND EXISTS (SELECT 1 FROM invoicing_reminders r WHERE r.invoice_id = i.id AND r.step = 'sent')`)
  let count = 0
  for (const row of open) {
    const step = stepDue(row.dueOn, on, days)
    const sent = new Set((row.steps ?? '').split(','))
    if (!step || STEPS.slice(STEPS.indexOf(step)).some(s => sent.has(s))) continue
    await sendInvoice(unit, await requireInvoice(row.id), step, null)
    count++
  }
  return count
}
