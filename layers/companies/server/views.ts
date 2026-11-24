// What the console's Companies list and a company's record page show (spec part 5): read only.
import { all, can, first, refuse } from '#kit'
import type { Actor } from '#kit'
import { addressesFor } from '#modules/core'
import type { EngagementKind, Receives } from '../shared/companies'
import type { CompanyDetail, CompanyRow, ContactRow, EngagementRow } from '../shared/views'

const LAST_DATE = '(SELECT max(p.starts_at) FROM core_performances p WHERE p.production_id = e.production_id)'
const PERSON = 'CASE WHEN a.anonymised_at IS NOT NULL THEN \'Former member\' ELSE coalesce(nullif(a.name, \'\'), \'Unnamed person\') END'

/** Every company, archived ones last, with what the list shows of each. */
export async function listCompanies(): Promise<CompanyRow[]> {
  const rows = await all<Omit<CompanyRow, 'archived' | 'kinds'> & { archivedAt: number | null, kinds: string | null }>(`
    SELECT c.id, c.name, c.public_name AS publicName, c.archived_at AS archivedAt,
      (SELECT count(*) FROM companies_engagements e WHERE e.company_id = c.id AND e.state NOT IN ('cancelled', 'settled')) AS live,
      (SELECT group_concat(DISTINCT e.kind) FROM companies_engagements e WHERE e.company_id = c.id) AS kinds,
      (SELECT ${PERSON} FROM companies_contacts k JOIN core_accounts a ON a.id = k.account_id WHERE k.company_id = c.id AND k.ended_at IS NULL AND k.is_primary = 1) AS primaryContact,
      (SELECT max(${LAST_DATE}) FROM companies_engagements e WHERE e.company_id = c.id AND e.state <> 'cancelled') AS lastDate
    FROM companies_companies c WHERE c.merged_into_id IS NULL ORDER BY c.archived_at IS NOT NULL, c.name COLLATE NOCASE`)
  return rows.map(({ archivedAt, kinds, ...r }) => ({ ...r, archived: archivedAt !== null, kinds: (kinds?.split(',') ?? []) as EngagementKind[] }))
}

/** One company for its record page, with what the viewer may do. Contacts' addresses and phones only for someone who manages contacts. */
export async function companyDetail(actor: Actor, id: string): Promise<CompanyDetail> {
  const company = await first<Omit<CompanyDetail, 'archived' | 'individual' | 'canManage' | 'canManageContacts' | 'contacts' | 'engagements'> & { archivedAt: number | null, individual: number }>(`
    SELECT id, name, public_name AS publicName, legal_name AS legalName, registration, tax_number AS taxNumber, address, postcode,
      invoice_email AS invoiceEmail, website, description, notes, individual, archived_at AS archivedAt, created_at AS createdAt
    FROM companies_companies WHERE id = ? AND merged_into_id IS NULL`, id)
  if (!company) refuse('core.not-found', 'There is no such company.', { status: 404 })
  const [canManage, manage, contacts, engagements] = await Promise.all([
    can(actor, 'companies.company.manage', ['companies.company', id]).then(d => d.allowed),
    can(actor, 'companies.contact.manage', ['companies.company', id]).then(d => d.allowed),
    contactsOf(id),
    all<EngagementRow>(`SELECT e.id, e.title, e.kind, e.state, e.production_id AS productionId, ${LAST_DATE} AS lastDate
      FROM companies_engagements e WHERE e.company_id = ? ORDER BY e.created_at DESC`, id),
  ])
  const emails = manage ? await addressesFor(contacts.map(c => c.accountId), 'audience') : new Map<string, string | null>()
  const { archivedAt, individual, ...rest } = company!
  return {
    ...rest,
    archived: archivedAt !== null,
    individual: !!individual,
    canManage,
    canManageContacts: manage,
    contacts: contacts.map(c => ({ ...c, email: emails.get(c.accountId) ?? null, dayPhone: manage ? c.dayPhone : null })),
    engagements,
  }
}

async function contactsOf(companyId: string): Promise<ContactRow[]> {
  const rows = await all<Omit<ContactRow, 'receives' | 'email' | 'unclaimed' | 'isPrimary'> & { receives: string, isPrimary: number, claimedAt: number | null }>(`
    SELECT k.id, k.account_id AS accountId, ${PERSON} AS name, k.role, k.is_primary AS isPrimary, k.receives, k.day_phone AS dayPhone, a.first_signed_in_at AS claimedAt
    FROM companies_contacts k JOIN core_accounts a ON a.id = k.account_id
    WHERE k.company_id = ? AND k.ended_at IS NULL ORDER BY k.is_primary DESC, name COLLATE NOCASE`, companyId)
  return rows.map(({ receives, isPrimary, claimedAt, ...r }) => ({ ...r, isPrimary: !!isPrimary, receives: JSON.parse(receives) as Receives[], email: null, unclaimed: claimedAt === null }))
}
