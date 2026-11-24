// Companies and contacts (spec part 3, rules G1, G4): adding a company, adding and ending the people
// who act for it, and which company a record belongs to, for the fact `companies.contact-of`.
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { all, first, inAccountScope, newId, nowMs, refuse, useDb } from '#kit'
import type { Actor, UnitOfWork } from '#kit'
import { LIMITS, RECEIVES } from '../shared/companies'

export interface Company { id: string, name: string, publicName: string | null, archivedAt: number | null }
export interface Contact { id: string, companyId: string, accountId: string, isPrimary: boolean, endedAt: number | null }

const LIVE_ENGAGEMENT = 'state NOT IN (\'cancelled\', \'settled\')'

export const companyInput = z.object({
  name: z.string().trim().min(1).max(LIMITS.name),
  publicName: z.string().trim().min(1).max(LIMITS.name).optional(),
  legalName: z.string().trim().min(1).max(LIMITS.legalName).optional(),
  website: z.string().trim().max(LIMITS.website).startsWith('https://').optional(),
  description: z.string().trim().max(LIMITS.description).optional(),
})

export const contactInput = z.object({
  accountId: z.string().min(1),
  role: z.string().trim().max(LIMITS.role).optional(),
  primary: z.boolean().optional(),
  receives: z.array(z.enum(RECEIVES)).default([...RECEIVES]),
  dayPhone: z.string().trim().max(LIMITS.phone).optional(),
})

export const endInput = z.object({ primaryId: z.string().optional() })

export async function requireCompany(id: string): Promise<Company> {
  const company = await first<Company>('SELECT id, name, public_name AS publicName, archived_at AS archivedAt FROM companies_companies WHERE id = ?', id)
  if (!company) refuse('core.not-found', 'There is no such company.', { status: 404 })
  return company!
}

/** Rule G1: a name unique among unarchived companies, ignoring case. */
export async function createCompany(unit: UnitOfWork, actor: Actor, input: z.infer<typeof companyInput>): Promise<string> {
  const id = newId('cpy')
  const at = nowMs()
  const taken = await first<{ name: string }>('SELECT name FROM companies_companies WHERE lower(name) = lower(?) AND archived_at IS NULL', input.name)
  if (taken) refuse('companies.company.name-taken', `There is already a company called ${taken.name}.`, { status: 409, remedy: 'Open that company, or give this one a different name.' })
  unit.add({
    sql: `INSERT INTO companies_companies (id, name, public_name, legal_name, website, description, individual, data_class, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, 0, 'public', ?, ? WHERE NOT EXISTS (SELECT 1 FROM companies_companies WHERE lower(name) = lower(?) AND archived_at IS NULL)`,
    params: [id, input.name, input.publicName ?? null, input.legalName ?? null, input.website ?? null, input.description ?? null, at, at, input.name],
  }).expect(1, { code: 'companies.company.name-taken', reason: 'Someone added a company with this name just now.', remedy: 'Open that company, or give this one a different name.' })
  unit.audit({ action: 'create', record: ['companies.company', id], detail: { by: actor.accountId ?? null } })
  return id
}

/** Adds a contact. The first live contact of a company is its primary unless another is named (G4). */
export async function addContact(unit: UnitOfWork, actor: Actor, company: Company, input: z.infer<typeof contactInput>): Promise<string> {
  if (company.archivedAt !== null) refuse('companies.company.archived', 'This company is archived.', { status: 409, remedy: 'Restore it first.' })
  if (!(await first('SELECT 1 FROM core_accounts WHERE id = ? AND anonymised_at IS NULL', input.accountId))) refuse('core.not-found', 'There is no such person.', { status: 404 })
  const id = newId('cpc')
  const at = nowMs()
  const primary = await first<{ id: string }>('SELECT id FROM companies_contacts WHERE company_id = ? AND ended_at IS NULL AND is_primary = 1', company.id)
  const isPrimary = input.primary ?? !primary
  if (isPrimary && primary) unit.add({ sql: 'UPDATE companies_contacts SET is_primary = 0, updated_at = ? WHERE id = ? AND is_primary = 1 AND ended_at IS NULL', params: [at, primary.id] }).expect(1, MOVED)
  unit.add(sql`INSERT INTO companies_contacts (id, company_id, account_id, role, is_primary, receives, day_phone, added_by, created_at, updated_at)
    SELECT ${id}, ${company.id}, ${input.accountId}, ${input.role ?? null}, ${isPrimary ? 1 : 0}, ${JSON.stringify(input.receives)}, ${input.dayPhone ?? null}, ${actor.accountId ?? null}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM companies_contacts WHERE company_id = ${company.id} AND ended_at IS NULL AND ${inAccountScope('account_id', input.accountId)})`)
    .expect(1, { code: 'companies.contact.already', reason: 'This person is already a contact of this company.', remedy: 'Change their existing contact details instead.' })
  unit.audit({ action: 'create', record: ['companies.company', company.id], detail: { contactId: id, primary: isPrimary } })
  unit.announce('companies.contact.changed', { companyId: company.id, contactId: id }, { record: ['companies.company', company.id] })
  return id
}

const MOVED = { code: 'companies.contact.changed-elsewhere', reason: 'Someone changed this company\'s contacts just now.', remedy: 'Reload the page and try again.' }

/**
 * Ends a contact (G4): ending the primary while others remain names who becomes primary, and the last
 * contact of a company with a live engagement cannot be ended. Their access ends with the batch (CO-05).
 */
export async function endContact(unit: UnitOfWork, company: Company, contactId: string, input: z.infer<typeof endInput>): Promise<void> {
  const contact = await first<Contact>('SELECT id, company_id AS companyId, account_id AS accountId, is_primary AS isPrimary, ended_at AS endedAt FROM companies_contacts WHERE id = ? AND company_id = ?', contactId, company.id)
  if (!contact || contact.endedAt !== null) refuse('core.not-found', 'There is no such contact.', { status: 404 })
  const others = await all<{ id: string }>('SELECT id FROM companies_contacts WHERE company_id = ? AND ended_at IS NULL AND id <> ?', company.id, contactId)
  if (contact!.isPrimary && others.length && !others.some(o => o.id === input.primaryId))
    refuse('companies.contact.choose-primary', 'Choose who becomes the primary contact.', { status: 422, remedy: 'Pick one of the company\'s other contacts.' })
  const at = nowMs()
  unit.add({
    sql: `UPDATE companies_contacts SET ended_at = ?, is_primary = 0, updated_at = ? WHERE id = ? AND ended_at IS NULL
          AND (EXISTS (SELECT 1 FROM companies_contacts WHERE company_id = ? AND ended_at IS NULL AND id <> ?)
            OR NOT EXISTS (SELECT 1 FROM companies_engagements WHERE company_id = ? AND ${LIVE_ENGAGEMENT}))`,
    params: [at, at, contactId, company.id, contactId, company.id],
  }).expect(1, { code: 'companies.contact.last', reason: 'This is the last contact of a company with a live engagement.', remedy: 'Add another contact first.' })
  if (contact!.isPrimary && input.primaryId)
    unit.add({ sql: 'UPDATE companies_contacts SET is_primary = 1, updated_at = ? WHERE id = ? AND company_id = ? AND ended_at IS NULL', params: [at, input.primaryId, company.id] }).expect(1, MOVED)
  unit.audit({ action: 'update', record: ['companies.company', company.id], detail: { contactId, ended: true } })
  unit.announce('companies.contact.changed', { companyId: company.id, contactId }, { record: ['companies.company', company.id] })
}

/** The company a record belongs to, for the fact: the company, an engagement's, or a production's live engagement's. */
export async function companyOf(record?: { type: string, id: string }): Promise<string | null> {
  if (!record) return null
  if (record.type === 'companies.company') return record.id
  if (record.type === 'companies.engagement')
    return (await first<{ company_id: string }>(`SELECT company_id FROM companies_engagements WHERE id = ? AND ${LIVE_ENGAGEMENT}`, record.id))?.company_id ?? null
  const production = record.type === 'core.production'
    ? record.id
    : record.type === 'core.performance' ? (await first<{ production_id: string }>('SELECT production_id FROM core_performances WHERE id = ?', record.id))?.production_id : null
  if (!production) return null
  return (await first<{ company_id: string }>(`SELECT company_id FROM companies_engagements WHERE production_id = ? AND ${LIVE_ENGAGEMENT}`, production))?.company_id ?? null
}

/** Whether the account, or one merged into it, is a live contact of the company now. */
export async function isLiveContact(companyId: string, accountId: string): Promise<boolean> {
  const found = await useDb().all(sql`SELECT 1 FROM companies_contacts WHERE company_id = ${companyId} AND ended_at IS NULL AND ${inAccountScope('account_id', accountId)} LIMIT 1`)
  return found.length > 0
}

/** The accounts that are live contacts of a company now. */
export async function liveContacts(companyId: string): Promise<string[]> {
  return (await all<{ account_id: string }>('SELECT account_id FROM companies_contacts WHERE company_id = ? AND ended_at IS NULL', companyId)).map(r => r.account_id)
}
