// Bank details of the people and companies the theatre pays (P-A1). Sealed with the core key and
// read in full only under payments.payee.read, which audits the read; everyone else, the person
// included, sees the name's first letter and the account number's last two digits.
import { all, first, localDate, newId, nowMs, openColumn, Refusal, sealColumn, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export interface Party { module: string, id: string }

export interface PayeeDetails { accountName: string, sortCode: string, accountNumber: string }

export interface MaskedPayee {
  id: string
  party: Party
  /** Whether details are held; false once they are cleared. */
  held: boolean
  /** The account name's first letter and the account number's last two digits, never more. */
  initial: string | null
  lastDigits: string | null
  lastUsedOn: string | null
}

const SORT_CODE = /^\d{6}$/ // not-policy: the shape of a UK sort code
const ACCOUNT_NUMBER = /^\d{8}$/ // not-policy: the shape of a UK account number

interface Row { id: string, party_module: string, party_id: string, account_id: string | null, account_name: string | null, sort_code: string | null, account_number: string | null, last_digits: string | null, last_used_on: string | null }

function maskOf(row: Row, initial: string | null): MaskedPayee {
  const held = row.last_digits !== null
  return { id: row.id, party: { module: row.party_module, id: row.party_id }, held, initial: held ? initial : null, lastDigits: row.last_digits, lastUsedOn: row.last_used_on }
}

/** Normalises and checks typed details: spaces and hyphens go, a sort code is 6 digits, an account number 8. */
export function cleanDetails(input: PayeeDetails): PayeeDetails {
  const sortCode = input.sortCode.replace(/[\s-]/g, '')
  const accountNumber = input.accountNumber.replace(/\s/g, '')
  const accountName = input.accountName.trim()
  const fields: Record<string, string> = {}
  if (!accountName) fields.accountName = 'payments.payee.name-needed'
  if (!SORT_CODE.test(sortCode)) fields.sortCode = 'payments.payee.sort-code'
  if (!ACCOUNT_NUMBER.test(accountNumber)) fields.accountNumber = 'payments.payee.account-number'
  if (Object.keys(fields).length) throw new Refusal('payments.payee.invalid', 'Those bank details are not complete: a sort code is 6 digits and an account number 8.', { status: 422, fields })
  return { accountName, sortCode, accountNumber }
}

async function rowFor(party: Party): Promise<Row | null> {
  if (party.module === 'core') {
    return first<Row>(`SELECT * FROM payments_payees WHERE party_module = 'core' AND account_id IN (${accountScopeSql('?1')}) ORDER BY updated_at DESC LIMIT 1`, party.id)
  }
  return first<Row>('SELECT * FROM payments_payees WHERE party_module = ? AND party_id = ?', party.module, party.id)
}

/**
 * Saves a party's bank details, replacing any held. For a person (`core`), the account id is the
 * subject; for a company, there is none and staff find the row.
 */
export async function savePayee(unit: UnitView, party: Party, details: PayeeDetails): Promise<string> {
  const clean = cleanDetails(details)
  const existing = await rowFor(party)
  const sealed = [await sealColumn(clean.accountName), await sealColumn(clean.sortCode), await sealColumn(clean.accountNumber), clean.accountNumber.slice(-2)]
  const at = nowMs()
  if (existing) {
    unit.add({ sql: 'UPDATE payments_payees SET account_name = ?, sort_code = ?, account_number = ?, last_digits = ?, updated_at = ? WHERE id = ?', params: [...sealed, at, existing.id] }).expect(1)
    unit.audit({ action: 'update', record: ['payments.payee', existing.id] })
    return existing.id
  }
  const id = newId('ppy')
  unit.add({
    sql: 'INSERT INTO payments_payees (id, party_module, party_id, account_id, account_name, sort_code, account_number, last_digits, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    params: [id, party.module, party.id, party.module === 'core' ? party.id : null, ...sealed, at, at],
  })
  unit.audit({ action: 'create', record: ['payments.payee', id] })
  return id
}

/** Clears a party's details, keeping the row so payments made to it still name it. */
export async function clearPayee(unit: UnitView, party: Party): Promise<boolean> {
  const existing = await rowFor(party)
  if (!existing || existing.last_digits === null) return false
  unit.add({ sql: 'UPDATE payments_payees SET account_name = NULL, sort_code = NULL, account_number = NULL, last_digits = NULL, updated_at = ? WHERE id = ?', params: [nowMs(), existing.id] }).expect(1)
  unit.audit({ action: 'update', record: ['payments.payee', existing.id], detail: { cleared: true } })
  return true
}

/** A party's details, masked. Null when none were ever saved. */
export async function payeeFor(party: Party): Promise<MaskedPayee | null> {
  const row = await rowFor(party)
  if (!row) return null
  return maskOf(row, row.account_name ? (await openColumn(row.account_name))!.slice(0, 1) : null)
}

/** Several payees by id, masked, for a list of payments to make. */
export async function maskedPayees(ids: readonly string[]): Promise<Map<string, MaskedPayee>> {
  const rows = ids.length ? await all<Row>('SELECT * FROM payments_payees WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify([...new Set(ids)])) : []
  const out = new Map<string, MaskedPayee>()
  for (const row of rows) out.set(row.id, maskOf(row, row.account_name ? (await openColumn(row.account_name))!.slice(0, 1) : null))
  return out
}

/**
 * The full details, for the person making the payment in their bank. The caller has checked
 * payments.payee.read; the read is audited here, with no detail but the payee's id.
 */
export async function readPayee(unit: UnitView, payeeId: string): Promise<PayeeDetails | null> {
  const row = await first<Row>('SELECT * FROM payments_payees WHERE id = ?', payeeId)
  if (!row) throw new Refusal('core.not-found', 'There are no such bank details.', { status: 404 })
  unit.audit({ action: 'read', record: ['payments.payee', row.id], ability: 'payments.payee.read' })
  if (row.account_name === null || row.sort_code === null || row.account_number === null) return null
  return { accountName: (await openColumn(row.account_name))!, sortCode: (await openColumn(row.sort_code))!, accountNumber: (await openColumn(row.account_number))! }
}

/** Marks a payee used today, so the keep-for clock restarts. */
export async function touchPayee(unit: UnitView, payeeId: string): Promise<void> {
  unit.add({ sql: 'UPDATE payments_payees SET last_used_on = ?, updated_at = ? WHERE id = ?', params: [await localDate(nowMs()), nowMs(), payeeId] })
}
