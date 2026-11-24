// The passes people hold (BO-64). A pass has a short code, `PASS-7KD2-M4QX`, which makes
// reservations; at the door it admits only the entry it booked for that night. The code is stored as
// its hash, and sealed beside it so the holder's pass page and staff can show it again. A person
// may hold any number of passes. Issuing here is by staff, or for passes brought in from another
// system; a pass bought in an order is issued by the sale (pass-sales.ts) through the same function.
import { sql } from 'drizzle-orm'
import { all, can, first, newId, nowMs, openColumn, refuse, sealColumn, useSetting, type Actor, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { accountLabel, getPerformance, getProduction, notify } from '#modules/core'
import { hashOf, REFERENCE_ALPHABET } from './codes'
import { getPassType } from './passes'

const CODE_LENGTH = 8 // not-policy: two groups of four, short enough to type and read out
const GROUP = 4 // not-policy: the code is shown in groups of four
const PREFIX = 'PASS'

/** A new pass code's eight characters, without the prefix: what is hashed and sealed. */
export function newPassCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...bytes].map(b => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join('')
}

/** A code as people see it: PASS-7KD2-M4QX. */
export const shownPassCode = (code: string) => `${PREFIX}-${code.slice(0, GROUP)}-${code.slice(GROUP)}`

/**
 * A code as typed or scanned, down to its eight characters: capitals, no spaces or hyphens, and the
 * PASS in front dropped. Anything else comes back as it is, to be found unknown.
 */
export function normalisePassCode(typed: string): string {
  const plain = typed.replace(/[^A-Za-z0-9]/g, '').toUpperCase() // not-policy: the digits of a code
  return plain.startsWith(PREFIX) && plain.length === PREFIX.length + CODE_LENGTH ? plain.slice(PREFIX.length) : plain
}

/** The hash of a code from another system as it scans, kept beside a pass brought in from there. */
export const aliasHashOf = (text: string) => hashOf(text.trim().toUpperCase())

/** What a typed or scanned code is looked up by: as one of ours, and as another system's whole. */
export async function passCodeHashes(typed: string): Promise<[string, string]> {
  return [await hashOf(normalisePassCode(typed)), await aliasHashOf(typed)]
}

export interface IssueInput {
  passTypeId: string
  passPriceId: string
  /** The holder; null for a pass sold at the desk to nobody in particular. */
  accountId: string | null
  /** Whether it is paid for already. */
  paid: boolean
  /** Given free (Matt, 19 November): nothing was paid and nothing is owed, so it is held at no amount and settled. */
  gift?: boolean
  /** False for a pass made in a basket, which becomes somebody's when its order is reserved or confirmed. */
  issued?: boolean
  orderLineId?: string | null
  issuedBy: string | null
  /** The id to give it, where the caller needs it before the pass is written. */
  id?: string
  /** A code to keep, for a pass brought in from another system; a new one otherwise. */
  code?: string
  /** The text of the code its holder already has from another system, of any length, which then finds the pass too. */
  alias?: string
}

/**
 * Adds a pass to the unit and returns its id and its code as shown. What it was sold with is copied
 * onto it: the amount, the allowance and whether it is one performance of each show.
 */
export async function issuePass(unit: UnitView, input: IssueInput): Promise<{ id: string, code: string, named: boolean }> {
  const type = await getPassType(input.passTypeId)
  const price = type.prices.find(p => p.id === input.passPriceId)
  if (!price) refuse('box-office.pass.price-not-found', 'That is not one of this pass\'s prices.', { status: 422, fields: { passPriceId: 'Choose a price.' } })
  // Only its holder may use it when the pass says so, or when its price is only for some people.
  const named = type.holder === 'named' || (type.holder === 'auto' && price.requirementRefs.length > 0)
  if (named && !input.accountId && (input.issued ?? true)) refuse('box-office.pass.holder-needed', `A ${type.name} at the ${price.name} price is in one person's name.`, { status: 422, remedy: 'Find the person it is for first.', fields: { accountId: 'Choose who it is for.' } })
  const code = input.code ? normalisePassCode(input.code) : newPassCode()
  if (!/^[A-Z0-9]{4,16}$/.test(code)) refuse('box-office.pass.code-shape', 'A pass code is letters and numbers.', { status: 422, fields: { code: 'Letters and numbers only.' } }) // not-policy: the lengths a code staff choose may be
  const id = input.id ?? newId('pass')
  const at = nowMs()
  const hash = await hashOf(code)
  const alias = input.alias ? await aliasHashOf(input.alias) : null
  unit.add(sql`INSERT INTO box_office_passes (id, pass_type_id, pass_price_id, order_line_id, account_id, named, code_hash, alias_hash, code, uses_total, once, amount_minor, currency, issued_at, paid_at, state, issued_by, created_at, updated_at)
    SELECT ${id}, ${type.id}, ${price.id}, ${input.orderLineId ?? null}, ${input.accountId}, ${named ? 1 : 0}, ${hash}, ${alias}, ${await sealColumn(code)}, ${type.uses}, ${type.perShow === 'once' ? 1 : 0}, ${input.gift ? 0 : price.amountMinor}, ${type.currency},
      ${(input.issued ?? true) ? at : null}, ${input.paid || input.gift ? at : null}, 'active', ${input.issuedBy}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM box_office_passes WHERE code_hash = ${hash} OR (${alias} IS NOT NULL AND alias_hash = ${alias}))`).expect(1, { code: 'box-office.pass.code-taken', reason: 'Another pass already has that code.', remedy: 'Choose another code.' })
  unit.audit({ action: 'create', record: ['box-office.pass', id], detail: { passTypeId: type.id, paid: input.paid, ...(input.gift ? { gift: true } : {}) } })
  return { id, code: shownPassCode(code), named }
}

export interface HeldPass {
  id: string
  passTypeId: string
  name: string
  priceName: string
  accountId: string | null
  named: boolean
  /** As shown, PASS-XXXX-XXXX; null where it was cleared with the person. */
  code: string | null
  usesTotal: number | null
  usesTaken: number
  once: boolean
  amountMinor: number
  /** What tickets already paid for have put towards it. */
  creditMinor: number
  currency: string
  issuedAt: number | null
  paidAt: number | null
  state: 'active' | 'void'
}

interface PassRow { id: string, pass_type_id: string, name: string, price_name: string, account_id: string | null, named: number, code: string | null, uses_total: number | null, uses_taken: number, once: number, amount_minor: number, credit_minor: number, currency: string, issued_at: number | null, paid_at: number | null, state: 'active' | 'void' }

const PASSES = `SELECT p.id, p.pass_type_id, t.name, r.name AS price_name, p.account_id, p.named, p.code, p.uses_total, p.uses_taken, p.once, p.amount_minor, p.credit_minor, p.currency, p.issued_at, p.paid_at, p.state
  FROM box_office_passes p JOIN box_office_pass_types t ON t.id = p.pass_type_id JOIN box_office_pass_prices r ON r.id = p.pass_price_id`

async function toPass(r: PassRow): Promise<HeldPass> {
  return {
    id: r.id, passTypeId: r.pass_type_id, name: r.name, priceName: r.price_name, accountId: r.account_id, named: !!r.named,
    code: r.code ? shownPassCode(await openColumn(r.code) as string) : null,
    usesTotal: r.uses_total, usesTaken: r.uses_taken, once: !!r.once, amountMinor: r.amount_minor, creditMinor: r.credit_minor, currency: r.currency, issuedAt: r.issued_at, paidAt: r.paid_at, state: r.state,
  }
}

/** The pass a code belongs to, or null. */
export async function passByCode(typed: string): Promise<HeldPass | null> {
  const row = await first<PassRow>(`${PASSES} WHERE p.code_hash = ? OR p.alias_hash = ?`, ...await passCodeHashes(typed))
  return row ? toPass(row) : null
}

export async function getPass(id: string): Promise<HeldPass> {
  const row = await first<PassRow>(`${PASSES} WHERE p.id = ?`, id)
  if (!row) refuse('box-office.pass.not-found', 'There is no such pass.', { status: 404 })
  return toPass(row)
}

/** The passes of one kind people hold, newest first, for the staff list. */
export async function passesOfType(passTypeId: string): Promise<HeldPass[]> {
  return Promise.all((await all<PassRow>(`${PASSES} WHERE p.pass_type_id = ? AND p.issued_at IS NOT NULL ORDER BY p.created_at DESC, p.id`, passTypeId)).map(toPass))
}

export interface PassHolder extends HeldPass {
  /** Who holds it, as staff see a person; null for a pass nobody is named on. */
  holder: string | null
  /** Entries booked with it that still stand, and how many shows they are for. */
  entries: number
  shows: number
}

/** The passes of one kind people hold, with who holds each and what they have booked, for the staff list. */
export async function holdersOf(passTypeId: string): Promise<PassHolder[]> {
  const used = new Map((await all<{ pass_id: string, entries: number, shows: number }>(
    `SELECT d.pass_id, count(*) AS entries, count(DISTINCT d.production_id) AS shows FROM box_office_pass_redemptions d JOIN box_office_passes p ON p.id = d.pass_id
      JOIN box_office_orders o ON o.id = d.order_id WHERE p.pass_type_id = ? AND d.state = 'live' AND o.state IN ('reserved', 'awaiting_payment', 'confirmed') GROUP BY d.pass_id`, passTypeId)).map(r => [r.pass_id, r]))
  return Promise.all((await passesOfType(passTypeId)).map(async pass => ({
    ...pass, holder: pass.accountId ? await accountLabel(pass.accountId) : null, entries: used.get(pass.id)?.entries ?? 0, shows: used.get(pass.id)?.shows ?? 0,
  })))
}

export interface PassEntry { orderId: string, reference: string, performanceId: string, productionId: string, show: string, startsAt: number, /** Whether the booking is paid or free, so its ticket is issued. */ confirmed: boolean }

/** What has been booked with a pass and still stands, soonest first. */
export async function entriesOf(passId: string): Promise<PassEntry[]> {
  const rows = await all<{ order_id: string, reference: string, performance_id: string, production_id: string, state: string }>(
    `SELECT d.order_id, o.reference, d.performance_id, d.production_id, o.state FROM box_office_pass_redemptions d JOIN box_office_orders o ON o.id = d.order_id
      WHERE d.pass_id = ? AND d.state = 'live' AND o.state IN ('reserved', 'awaiting_payment', 'confirmed')`, passId)
  const out: PassEntry[] = []
  for (const r of rows) {
    const performance = await getPerformance(r.performance_id)
    out.push({ orderId: r.order_id, reference: r.reference, performanceId: r.performance_id, productionId: r.production_id, show: (await getProduction(r.production_id)).title, startsAt: performance.startsAt, confirmed: r.state === 'confirmed' })
  }
  return out.sort((a, b) => a.startsAt - b.startsAt)
}

const GONE = { code: 'box-office.pass.changed', reason: 'This pass has just changed.', remedy: 'Reload to see it as it is now.' }

/** Tells a pass's holder its code: when it is given by hand, moved to them, or asked for again. */
export async function sendPass(unit: UnitView, passId: string, reason: string, made?: Pick<HeldPass, 'id' | 'accountId' | 'code' | 'state' | 'currency' | 'amountMinor' | 'name' | 'priceName' | 'paidAt'> & { creditMinor?: number }): Promise<boolean> {
  const pass = made ?? await getPass(passId)
  if (!pass.accountId || !pass.code || pass.state !== 'active') return false
  const amount = new Intl.NumberFormat((await useSetting('core.locale.language') as string | null) ?? 'en-GB', { style: 'currency', currency: pass.currency }).format((pass.amountMinor - (pass.creditMinor ?? 0)) / 100) // not-policy: minor units to units
  await notify(unit, 'box-office.pass-issued', {
    to: pass.accountId,
    variables: { pass: pass.name, price: pass.priceName, code: pass.code, paid: pass.paidAt ? 'It is paid for.' : `There is ${amount} to pay for it, which is taken at the box office when you come to your first show.` },
    subject: ['box-office.pass', pass.id],
    dedupeKey: `pass-issued:${pass.id}:${reason}`,
  })
  return true
}

/**
 * A pass given by hand, from the console: to a person, or to nobody in particular where the pass
 * allows that. `settled` says it was paid for some other way, and `gift` that it was given free, held
 * at no amount (Matt, 19 November); otherwise its price is collected with the first booking it is
 * used on. Its holder is sent the code.
 */
export async function givePass(unit: UnitView, input: { passTypeId: string, passPriceId: string, accountId: string | null, settled: boolean, gift?: boolean }, by: string | null): Promise<{ id: string, code: string }> {
  const type = await getPassType(input.passTypeId)
  if (!type.active) refuse('box-office.pass.retired', `${type.name} has been retired.`, { status: 409, remedy: 'Bring it back first.' })
  const pass = await issuePass(unit, { passTypeId: type.id, passPriceId: input.passPriceId, accountId: input.accountId, paid: input.settled, gift: input.gift, issuedBy: by })
  const price = type.prices.find(p => p.id === input.passPriceId)!
  await sendPass(unit, pass.id, 'given', { id: pass.id, accountId: input.accountId, code: pass.code, state: 'active', currency: type.currency, amountMinor: input.gift ? 0 : price.amountMinor, name: type.name, priceName: price.name, paidAt: input.settled || input.gift ? nowMs() : null })
  return { id: pass.id, code: pass.code }
}

/** Moves a pass to another person: what is booked with it stays booked, and it is theirs to use from now on. */
export function movePass(unit: UnitView, passId: string, accountId: string): void {
  unit.add(sql`UPDATE box_office_passes SET account_id = ${accountId}, updated_at = ${nowMs()} WHERE id = ${passId} AND state = 'active' AND issued_at IS NOT NULL`).expect(1, GONE)
  unit.audit({ action: 'update', record: ['box-office.pass', passId], detail: { movedTo: accountId } })
}

/** Cancels a pass, or brings a cancelled one back. Tickets already booked with it stay as they are. */
export function setPassVoid(unit: UnitView, passId: string, isVoid: boolean): void {
  unit.add(sql`UPDATE box_office_passes SET state = ${isVoid ? 'void' : 'active'}, updated_at = ${nowMs()} WHERE id = ${passId} AND state = ${isVoid ? 'active' : 'void'} AND issued_at IS NOT NULL`).expect(1, GONE)
  unit.audit({ action: 'update', record: ['box-office.pass', passId], detail: { state: isVoid ? 'void' : 'active' } })
}

/** Records that nothing more is owed for a pass, for money taken some other way. Money taken here is recorded by the sale. */
export function settlePass(unit: UnitView, passId: string): void {
  const at = nowMs()
  unit.add(sql`UPDATE box_office_passes SET paid_at = ${at}, updated_at = ${at} WHERE id = ${passId} AND paid_at IS NULL AND state = 'active' AND issued_at IS NOT NULL`).expect(1, GONE)
  unit.audit({ action: 'update', record: ['box-office.pass', passId], detail: { settledByHand: true } })
}

export interface MyPass { id: string, name: string, priceName: string, code: string | null, owedMinor: number, currency: string, left: number | null, state: 'active' | 'void', entries: PassEntry[], /** Shows it covers that are not booked with it yet. */ open: { productionId: string, title: string, slug: string }[] }

/** The passes on a person's account, with what each has booked and the shows it could still book. */
export async function myPasses(accountId: string): Promise<MyPass[]> {
  const rows = await all<PassRow>(`${PASSES} WHERE p.issued_at IS NOT NULL AND p.account_id IN (${accountScopeSql('?1')}) ORDER BY p.created_at DESC, p.id`, accountId)
  const out: MyPass[] = []
  for (const row of rows) {
    const pass = await toPass(row)
    const entries = await entriesOf(pass.id)
    const type = await getPassType(pass.passTypeId)
    const booked = new Set(entries.map(e => e.productionId))
    const open: MyPass['open'] = []
    if (type.covers === 'productions' && pass.state === 'active') {
      for (const id of type.productionIds.filter(id => !booked.has(id) || !pass.once)) {
        const production = await getProduction(id).catch(() => null)
        if (production && !booked.has(id)) open.push({ productionId: id, title: production.title, slug: production.slug })
      }
    }
    out.push({ id: pass.id, name: pass.name, priceName: pass.priceName, code: pass.code, owedMinor: pass.paidAt ? 0 : pass.amountMinor - pass.creditMinor, currency: pass.currency, left: pass.usesTotal === null ? null : pass.usesTotal - pass.usesTaken, state: pass.state, entries, open })
  }
  return out
}

/** A pass as staff see it on an order or a person's page, with its code (Matt, 19 November). */
export interface StaffPass { id: string, passTypeId: string, name: string, priceName: string, code: string | null, state: 'active' | 'void', paid: boolean, holder: string | null, holderId: string | null, /** Bought on this order, or used for an entry on it. */ how: 'bought' | 'entry' | 'held', entries: number }

async function toStaffPass(r: PassRow, how: StaffPass['how']): Promise<StaffPass> {
  const pass = await toPass(r)
  const entries = (await first<{ n: number }>(`SELECT count(*) AS n FROM box_office_pass_redemptions d JOIN box_office_orders o ON o.id = d.order_id
    WHERE d.pass_id = ? AND d.state = 'live' AND o.state IN ('reserved', 'awaiting_payment', 'confirmed')`, pass.id))!.n
  return { id: pass.id, passTypeId: pass.passTypeId, name: pass.name, priceName: pass.priceName, code: pass.code, state: pass.state, paid: pass.paidAt !== null, holder: pass.accountId ? await accountLabel(pass.accountId) : null, holderId: pass.accountId, how, entries }
}

/** The passes bought on an order and those its tickets were booked with, each once. */
export async function passesOnOrder(orderId: string): Promise<StaffPass[]> {
  const bought = await all<PassRow>(`${PASSES} WHERE p.order_line_id IN (SELECT id FROM box_office_order_lines WHERE order_id = ? AND kind = 'pass_sale') ORDER BY p.created_at, p.id`, orderId)
  const used = await all<PassRow>(`${PASSES} WHERE p.id IN (SELECT d.pass_id FROM box_office_pass_redemptions d JOIN box_office_order_lines l ON l.pass_redemption_id = d.id WHERE l.order_id = ?) ORDER BY p.created_at, p.id`, orderId)
  const seen = new Set(bought.map(r => r.id))
  return Promise.all([...bought.map(r => toStaffPass(r, 'bought')), ...used.filter(r => !seen.has(r.id)).map(r => toStaffPass(r, 'entry'))])
}

/** The passes a person holds, newest first, for their console page. */
export async function passesHeldBy(accountId: string): Promise<StaffPass[]> {
  const rows = await all<PassRow>(`${PASSES} WHERE p.issued_at IS NOT NULL AND p.account_id IN (${accountScopeSql('?1')}) ORDER BY p.created_at DESC, p.id`, accountId)
  return Promise.all(rows.map(r => toStaffPass(r, 'held')))
}

/** Pass codes are shown to staff who set passes up or sell at the desk, where codes are handed over. */
export async function mayReadPassCodes(actor: Actor): Promise<boolean> {
  return (await can(actor, 'box-office.pass.manage')).allowed || (await can(actor, 'box-office.order.sell')).allowed
}
