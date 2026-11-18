// The passes people hold (BO-64). A pass has a short code, `PASS-7KD2-M4QX`, which makes
// reservations and admits nobody: the door scans the reservation's tickets. The code is stored as
// its hash, and sealed beside it so the holder's pass page and staff can show it again. A person
// may hold any number of passes. Issuing here is by staff, or for passes brought in from another
// system; a pass bought in an order is issued by the sale (pass-sales.ts) through the same function.
import { sql } from 'drizzle-orm'
import { all, first, newId, nowMs, openColumn, refuse, sealColumn, type UnitView } from '#kit'
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

/** Whether what was typed has the shape of a pass code, so the desk's find box can tell one from a name. */
export const looksLikePassCode = (typed: string) => /^PASS[-\s]?[A-Za-z0-9]{4}[-\s]?[A-Za-z0-9]{4}$/i.test(typed.trim()) // not-policy: the shape of a code, PASS-XXXX-XXXX

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
    SELECT ${id}, ${type.id}, ${price.id}, ${input.orderLineId ?? null}, ${input.accountId}, ${named ? 1 : 0}, ${hash}, ${alias}, ${await sealColumn(code)}, ${type.uses}, ${type.perShow === 'once' ? 1 : 0}, ${price.amountMinor}, ${type.currency},
      ${(input.issued ?? true) ? at : null}, ${input.paid ? at : null}, 'active', ${input.issuedBy}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM box_office_passes WHERE code_hash = ${hash} OR (${alias} IS NOT NULL AND alias_hash = ${alias}))`).expect(1, { code: 'box-office.pass.code-taken', reason: 'Another pass already has that code.', remedy: 'Choose another code.' })
  unit.audit({ action: 'create', record: ['box-office.pass', id], detail: { passTypeId: type.id, paid: input.paid } })
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
  currency: string
  issuedAt: number | null
  paidAt: number | null
  state: 'active' | 'void'
}

interface PassRow { id: string, pass_type_id: string, name: string, price_name: string, account_id: string | null, named: number, code: string | null, uses_total: number | null, uses_taken: number, once: number, amount_minor: number, currency: string, issued_at: number | null, paid_at: number | null, state: 'active' | 'void' }

const PASSES = `SELECT p.id, p.pass_type_id, t.name, r.name AS price_name, p.account_id, p.named, p.code, p.uses_total, p.uses_taken, p.once, p.amount_minor, p.currency, p.issued_at, p.paid_at, p.state
  FROM box_office_passes p JOIN box_office_pass_types t ON t.id = p.pass_type_id JOIN box_office_pass_prices r ON r.id = p.pass_price_id`

async function toPass(r: PassRow): Promise<HeldPass> {
  return {
    id: r.id, passTypeId: r.pass_type_id, name: r.name, priceName: r.price_name, accountId: r.account_id, named: !!r.named,
    code: r.code ? shownPassCode(await openColumn(r.code) as string) : null,
    usesTotal: r.uses_total, usesTaken: r.uses_taken, once: !!r.once, amountMinor: r.amount_minor, currency: r.currency, issuedAt: r.issued_at, paidAt: r.paid_at, state: r.state,
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
