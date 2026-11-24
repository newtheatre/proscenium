// Companies themselves (spec part 3, rules G1 and G6): adding one with a warning of a near match,
// changing its details, archiving and restoring it, and what the console's list and record show.
import { z } from 'zod'
import { all, first, newId, nowMs, refuse } from '#kit'
import type { Actor, UnitOfWork } from '#kit'
import { setProductionCompanyName } from '#modules/core'
import { LIMITS, nameKey } from '../shared/companies'

export interface Company { id: string, name: string, publicName: string | null, archivedAt: number | null }

const LIVE_ENGAGEMENT = 'state NOT IN (\'cancelled\', \'settled\')'
const NAME_TAKEN = { code: 'companies.company.name-taken', remedy: 'Open that company, or give this one a different name.' }

/** An optional line of text: blank clears it. */
const line = (max: number) => z.string().trim().max(max).transform(v => v || null).nullable().optional()

export const companyInput = z.object({
  name: z.string().trim().min(1).max(LIMITS.name),
  publicName: z.string().trim().min(1).max(LIMITS.name).optional(),
  legalName: z.string().trim().min(1).max(LIMITS.legalName).optional(),
  website: z.string().trim().max(LIMITS.website).startsWith('https://').optional(),
  description: z.string().trim().max(LIMITS.description).optional(),
})

export const detailsInput = z.object({
  name: z.string().trim().min(1).max(LIMITS.name).optional(),
  publicName: line(LIMITS.name),
  legalName: line(LIMITS.legalName),
  registration: line(LIMITS.registration),
  taxNumber: line(LIMITS.taxNumber),
  address: line(LIMITS.address),
  postcode: line(LIMITS.postcode),
  invoiceEmail: z.union([z.literal(''), z.email().max(LIMITS.email)]).transform(v => v || null).nullable().optional(),
  website: z.union([z.literal(''), z.string().trim().max(LIMITS.website).startsWith('https://')]).transform(v => v || null).nullable().optional(),
  description: line(LIMITS.description),
  notes: line(LIMITS.notes),
})

export const matchesInput = z.object({ name: z.string().trim().max(LIMITS.name).default('') })

// The details form's fields and their columns, in one place for the update and the audit.
const COLUMNS = {
  name: 'name', publicName: 'public_name', legalName: 'legal_name', registration: 'registration', taxNumber: 'tax_number',
  address: 'address', postcode: 'postcode', invoiceEmail: 'invoice_email', website: 'website', description: 'description', notes: 'notes',
} as const satisfies Record<keyof z.infer<typeof detailsInput>, string>

export async function requireCompany(id: string): Promise<Company> {
  const company = await first<Company>('SELECT id, name, public_name AS publicName, archived_at AS archivedAt FROM companies_companies WHERE id = ?', id)
  if (!company) refuse('core.not-found', 'There is no such company.', { status: 404 })
  return company!
}

/** Rule G1: a name unique among unarchived companies, ignoring case. A near match only warns (`nearMatches`). */
export async function createCompany(unit: UnitOfWork, actor: Actor, input: z.infer<typeof companyInput>): Promise<string> {
  const id = newId('cpy')
  const at = nowMs()
  const taken = await first<{ name: string }>('SELECT name FROM companies_companies WHERE lower(name) = lower(?) AND archived_at IS NULL', input.name)
  if (taken) refuse(NAME_TAKEN.code, `There is already a company called ${taken.name}.`, { status: 409, remedy: NAME_TAKEN.remedy, fields: { name: 'This name is taken.' } })
  unit.add({
    sql: `INSERT INTO companies_companies (id, name, name_key, public_name, legal_name, website, description, individual, data_class, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, 0, 'public', ?, ? WHERE NOT EXISTS (SELECT 1 FROM companies_companies WHERE lower(name) = lower(?) AND archived_at IS NULL)`,
    params: [id, input.name, nameKey(input.name), input.publicName ?? null, input.legalName ?? null, input.website ?? null, input.description ?? null, at, at, input.name],
  }).expect(1, { ...NAME_TAKEN, reason: 'Someone added a company with this name just now.' })
  unit.audit({ action: 'create', record: ['companies.company', id], detail: { by: actor.accountId ?? null } })
  return id
}

/** Companies whose names differ from `name` only by case, punctuation, accents or "The", archived ones included. */
export async function nearMatches(name: string): Promise<{ id: string, name: string, archived: boolean }[]> {
  const key = nameKey(name)
  if (!key) return []
  const rows = await all<{ id: string, name: string, archivedAt: number | null }>(
    'SELECT id, name, archived_at AS archivedAt FROM companies_companies WHERE name_key = ? AND merged_into_id IS NULL ORDER BY archived_at IS NOT NULL, name COLLATE NOCASE LIMIT 5', // not-policy: a short list to offer
    key,
  )
  return rows.map(r => ({ id: r.id, name: r.name, archived: r.archivedAt !== null }))
}

/** Changes a company's details. A rename keeps G1 on the statement, so two renames to one name cannot both land. */
export async function updateCompany(unit: UnitOfWork, company: Company, input: z.infer<typeof detailsInput>): Promise<void> {
  const fields = (Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).filter(k => input[k] !== undefined)
  if (!fields.length) return
  const sets = fields.map(k => `${COLUMNS[k]} = ?`)
  const params: unknown[] = fields.map(k => input[k] ?? null)
  if (input.name !== undefined) {
    sets.push('name_key = ?')
    params.push(nameKey(input.name))
  }
  const at = nowMs()
  unit.add({
    sql: `UPDATE companies_companies SET ${sets.join(', ')}, updated_at = ? WHERE id = ?
          AND (? IS NULL OR NOT EXISTS (SELECT 1 FROM companies_companies o WHERE o.id <> companies_companies.id AND lower(o.name) = lower(?) AND o.archived_at IS NULL))`,
    params: [...params, at, company.id, input.name ?? null, input.name ?? null],
  }).expect(1, { ...NAME_TAKEN, reason: `There is already a company called ${input.name ?? company.name}.` })
  unit.audit({ action: 'update', record: ['companies.company', company.id], detail: { fields } })
  if (input.name !== undefined || input.publicName !== undefined)
    await followRename(unit, company.id, (input.publicName === undefined ? company.publicName : input.publicName) ?? input.name ?? company.name)
}

/** Rule G3: each production linked through a live engagement carries the company's public name. */
async function followRename(unit: UnitOfWork, companyId: string, publicName: string): Promise<void> {
  const linked = await all<{ id: string }>(`SELECT p.id FROM companies_engagements e JOIN core_productions p ON p.id = e.production_id
    WHERE e.company_id = ? AND e.state NOT IN ('cancelled', 'settled') AND p.state <> 'cancelled'`, companyId)
  for (const production of linked) await setProductionCompanyName(unit, production.id, publicName)
}

/** Rule G6: a company with a live engagement cannot be archived; the statement checks it. */
export function archiveCompany(unit: UnitOfWork, company: Company): void {
  const at = nowMs()
  unit.add({
    sql: `UPDATE companies_companies SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM companies_engagements WHERE company_id = ? AND ${LIVE_ENGAGEMENT})`,
    params: [at, at, company.id, company.id],
  }).expect(1, company.archivedAt !== null
    ? { code: 'companies.company.archived', reason: 'This company is already archived.', remedy: 'Reload the page.' }
    : { code: 'companies.company.live-engagement', reason: `${company.name} has an engagement that is not finished.`, remedy: 'Cancel or settle its engagements first.' })
  unit.audit({ action: 'state', record: ['companies.company', company.id], detail: { to: 'archived' } })
}

/** Rule G6: restored in one step, unless another unarchived company has taken its name meanwhile (G1). */
export function restoreCompany(unit: UnitOfWork, company: Company): void {
  unit.add({
    sql: `UPDATE companies_companies SET archived_at = NULL, updated_at = ? WHERE id = ? AND archived_at IS NOT NULL AND merged_into_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM companies_companies o WHERE o.id <> companies_companies.id AND lower(o.name) = lower(companies_companies.name) AND o.archived_at IS NULL)`,
    params: [nowMs(), company.id],
  }).expect(1, company.archivedAt === null
    ? { code: 'companies.company.not-archived', reason: 'This company is not archived.', remedy: 'Reload the page.' }
    : { ...NAME_TAKEN, reason: `Another company is now called ${company.name}.`, remedy: 'Rename one of them, or merge them.' })
  unit.audit({ action: 'state', record: ['companies.company', company.id], detail: { to: 'restored' } })
}
