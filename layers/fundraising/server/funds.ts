// Funds (FR-01, FR-05): where gifts go. Each has its own donations account, made in the unit that
// makes the fund. Exactly one active fund is the default; it cannot be archived. A restricted fund
// needs a purpose, and stays restricted (or not) once a gift has been received into it.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse, type UnitView } from '#kit'
import { ensureScopedAccount } from '#modules/finance'

export interface Fund { id: string, name: string, purpose: string | null, restricted: boolean, isDefault: boolean, offered: boolean, state: 'active' | 'archived', sort: number, received: boolean }

const COLUMNS = `id, name, purpose, restricted, is_default AS isDefault, offered, state, sort,
  EXISTS (SELECT 1 FROM fundraising_donations d WHERE d.fund_id = fundraising_funds.id AND d.state IN ('received', 'refunded')) AS received`
type Row = Omit<Fund, 'restricted' | 'isDefault' | 'offered' | 'received'> & { restricted: number, isDefault: number, offered: number, received: number }
const shape = (r: Row): Fund => ({ ...r, restricted: !!r.restricted, isDefault: !!r.isDefault, offered: !!r.offered, received: !!r.received })

export const fundFields = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: the column's bound
  purpose: z.string().trim().max(500).nullable(), // not-policy: shape bound
  restricted: z.boolean(),
  offered: z.boolean(),
}).strict()
export type FundFields = z.infer<typeof fundFields>

const NAME_TAKEN = { code: 'fundraising.fund.name-taken', reason: 'Another fund has that name.' }

export async function listFunds(): Promise<Fund[]> {
  return (await all<Row>(`SELECT ${COLUMNS} FROM fundraising_funds ORDER BY state = 'archived', sort, name`)).map(shape)
}

export async function getFund(id: string | undefined): Promise<Fund | null> {
  const row = id ? await first<Row>(`SELECT ${COLUMNS} FROM fundraising_funds WHERE id = ?`, id) : null
  return row ? shape(row) : null
}

export async function requireFund(id: string): Promise<Fund> {
  return await getFund(id) ?? refuse('core.not-found', 'There is no fund with that reference.', { status: 404 })
}

export async function defaultFund(): Promise<Fund | null> {
  const row = await first<Row>(`SELECT ${COLUMNS} FROM fundraising_funds WHERE is_default = 1 AND state = 'active'`)
  return row ? shape(row) : null
}

function checkFields(input: FundFields) {
  if (input.restricted && !input.purpose) refuse('fundraising.fund.purpose-needed', 'A restricted fund needs its purpose.', { status: 422, fields: { purpose: 'fundraising.fund.purpose-needed' } })
}

async function refuseTakenName(name: string, except?: string) {
  if (await first('SELECT 1 FROM fundraising_funds WHERE lower(name) = lower(?) AND state = \'active\' AND id <> ?', name, except ?? ''))
    refuse(NAME_TAKEN.code, NAME_TAKEN.reason, { status: 409, fields: { name: NAME_TAKEN.code } })
}

/** Adds a fund and its donations account in the unit. */
export async function createFund(unit: UnitView, input: FundFields & { isDefault?: boolean }): Promise<string> {
  checkFields(input)
  await refuseTakenName(input.name)
  const id = newId('gfd')
  const at = nowMs()
  unit.add({
    sql: `INSERT INTO fundraising_funds (id, name, purpose, restricted, is_default, offered, state, sort, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', (SELECT coalesce(max(sort), 0) + 1 FROM fundraising_funds), ?, ?)`,
    params: [id, input.name, input.purpose || null, input.restricted ? 1 : 0, input.isDefault ? 1 : 0, input.offered ? 1 : 0, at, at],
  }).expect(1, NAME_TAKEN)
  await ensureScopedAccount(unit, 'fundraising.donations', id, `Donations: ${input.name}`)
  unit.audit({ action: 'create', record: ['fundraising.fund', id], detail: { restricted: input.restricted, offered: input.offered } })
  return id
}

export async function updateFund(unit: UnitView, fund: Fund, input: FundFields): Promise<void> {
  checkFields(input)
  await refuseTakenName(input.name, fund.id)
  if (fund.received && fund.restricted !== input.restricted)
    refuse('fundraising.fund.restriction-fixed', 'This fund has received gifts, so whether it is restricted cannot change.', { status: 409, fields: { restricted: 'fundraising.fund.restriction-fixed' } })
  unit.add({
    sql: `UPDATE fundraising_funds SET name = ?, purpose = ?, restricted = ?, offered = ?, updated_at = ? WHERE id = ?
      AND (restricted = ? OR NOT EXISTS (SELECT 1 FROM fundraising_donations WHERE fund_id = ? AND state IN ('received', 'refunded')))`,
    params: [input.name, input.purpose || null, input.restricted ? 1 : 0, input.offered ? 1 : 0, nowMs(), fund.id, input.restricted ? 1 : 0, fund.id],
  }).expect(1, { code: 'fundraising.fund.restriction-fixed', reason: 'This fund has received gifts, so whether it is restricted cannot change.' })
  unit.audit({ action: 'update', record: ['fundraising.fund', fund.id], detail: { restricted: input.restricted, offered: input.offered } })
}

/** Makes a fund the default; the old default stops being one in the same batch. */
export function makeDefault(unit: UnitView, fund: Fund): void {
  if (fund.state !== 'active') refuse('fundraising.fund.archived', 'An archived fund cannot be the default.', { status: 409 })
  unit.add({ sql: 'UPDATE fundraising_funds SET is_default = 0, updated_at = ? WHERE is_default = 1 AND id <> ?', params: [nowMs(), fund.id] })
  unit.add({ sql: 'UPDATE fundraising_funds SET is_default = 1, updated_at = ? WHERE id = ? AND state = \'active\'', params: [nowMs(), fund.id] }).expect(1)
  unit.audit({ action: 'update', record: ['fundraising.fund', fund.id], detail: { isDefault: true } })
}

export async function archiveFund(unit: UnitView, fund: Fund, archive: boolean): Promise<void> {
  if (archive && fund.isDefault) refuse('fundraising.fund.default', 'Make another fund the default before archiving this one.', { status: 409 })
  if (!archive) await refuseTakenName(fund.name, fund.id)
  unit.add({ sql: 'UPDATE fundraising_funds SET state = ?, updated_at = ? WHERE id = ? AND is_default = 0', params: [archive ? 'archived' : 'active', nowMs(), fund.id] }).expect(1)
  unit.audit({ action: 'update', record: ['fundraising.fund', fund.id], detail: { archived: archive } })
}

/** FR-01: the general fund, made when the module is switched on. Safe to repeat. */
export async function ensureDefaultFund(unit: UnitView): Promise<void> {
  if (await first('SELECT 1 FROM fundraising_funds')) return
  await createFund(unit, { name: 'General fund', purpose: null, restricted: false, offered: true, isDefault: true })
}
