import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { londonParts } from '#shared/utils/london'
import { expiryFor } from '#shared/utils/training'
import { trainingModulesList } from '#shared/utils/training-modules-list'
import { aliasColumns, whereFrom } from './list-filters'
import type { ListClause } from './list-filters'
import type { AcademicYear, ExpiryPolicy } from '#shared/utils/training'
import type { ListQuery } from '#shared/utils/list-filters'
import type { SQL } from 'drizzle-orm'

// Explicit imports throughout, never the ambient ones training.ts leans on: tests typecheck this
// file directly under Bun, which carries no Nitro auto-imports (CONTRIBUTING, 0055).

// The declaration's predicates and order, bound through the `m` alias the raw SQL below uses
// (K-129). A lead's scope is ANDed on afterwards: it is a fact about the reader, not a filter.
export function trainingModulesClause(query: ListQuery): ListClause {
  return whereFrom(trainingModulesList, query, {
    column: aliasColumns('m'),
    search: [sql`m.id`, sql`m.name`],
  })
}

// The same "live lead" predicate training.ts's ledBy answers, repeated rather than imported: an
// import here would pull that file's ambient-reliant code into the Bun typecheck graph.
function ledBy(leadOf: string, now: Date): SQL {
  return inArray(
    schema.trainingModules.department,
    db.select({ department: schema.departmentLeads.department }).from(schema.departmentLeads)
      .where(and(
        eq(schema.departmentLeads.userId, leadOf),
        or(isNull(schema.departmentLeads.expiresAt), gt(schema.departmentLeads.expiresAt, Math.floor(now.getTime() / 1000))),
      )),
  )
}

export function scopedClause(clause: ListClause, leadOf?: string, now = new Date()): ListClause {
  return { ...clause, where: leadOf ? and(clause.where, ledBy(leadOf, now)) : clause.where }
}

const predicate = (clause: ListClause): SQL => (clause.where ? sql` WHERE ${clause.where}` : sql``)

const MODULE_LIST_COLUMNS = sql`
  m.id AS id,
  m.department AS department,
  m.kind AS kind,
  m.name AS name,
  m.description AS description,
  m.notes AS notes,
  m.delivery_mode AS deliveryMode,
  m.expiry_mode AS expiryMode,
  m.expiry_months AS expiryMonths,
  m.allows_external AS allowsExternal,
  m.external_evidence AS externalEvidence,
  m.safety_critical AS safetyCritical,
  m.signoff_required AS signoffRequired,
  m.grants_trainer AS grantsTrainer,
  m.grants_supervisor AS grantsSupervisor,
  m.self_registrable AS selfRegistrable,
  m.status AS status,
  m.sort AS sort
`

interface AdminModuleRow {
  id: string
  department: string
  kind: string
  name: string
  description: string | null
  notes: string | null
  deliveryMode: string
  expiryMode: string
  expiryMonths: number | null
  allowsExternal: number
  externalEvidence: string | null
  safetyCritical: number
  signoffRequired: number
  grantsTrainer: number
  grantsSupervisor: number
  selfRegistrable: number
  status: string
  sort: number
}

export interface AdminModule extends Omit<
  AdminModuleRow,
  'allowsExternal' | 'safetyCritical' | 'signoffRequired' | 'grantsTrainer' | 'grantsSupervisor' | 'selfRegistrable'
> {
  allowsExternal: boolean
  safetyCritical: boolean
  signoffRequired: boolean
  grantsTrainer: boolean
  grantsSupervisor: boolean
  selfRegistrable: boolean
  materials: { label: string, url: string }[]
  expiresIfAwardedToday: string | null
  frozen: boolean
}

// The console's paged listing (K-129, G-129). Materials and the frozen set are each a second
// query scoped to the page's own ids, never a join that repeats them per link (0003).
export async function listAdminModules(
  clause: ListClause,
  limit: number,
  offset: number,
  year: AcademicYear,
  now = new Date(),
): Promise<AdminModule[]> {
  const rows = await db.all<AdminModuleRow>(sql`
    SELECT ${MODULE_LIST_COLUMNS}
    FROM modules m${predicate(clause)}
    ORDER BY ${sql.join(clause.orderBy, sql`, `)}
    LIMIT ${limit} OFFSET ${offset}
  `)
  const ids = rows.map(row => row.id)
  const materials = ids.length === 0
    ? []
    : await db.select({
        moduleId: schema.moduleMaterials.moduleId,
        label: schema.moduleMaterials.label,
        url: schema.moduleMaterials.url,
      }).from(schema.moduleMaterials)
        .where(inArray(schema.moduleMaterials.moduleId, ids))
        .orderBy(asc(schema.moduleMaterials.sort))

  const frozen = ids.length === 0
    ? new Set<string>()
    : new Set((await db.selectDistinct({
        moduleId: schema.trainingRecords.moduleId,
      }).from(schema.trainingRecords)
        .where(and(isNull(schema.trainingRecords.revokedAt), inArray(schema.trainingRecords.moduleId, ids))))
        .map(record => record.moduleId))

  const parts = londonParts(now)
  const today = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`

  return rows.map(row => ({
    ...row,
    allowsExternal: row.allowsExternal === 1,
    safetyCritical: row.safetyCritical === 1,
    signoffRequired: row.signoffRequired === 1,
    grantsTrainer: row.grantsTrainer === 1,
    grantsSupervisor: row.grantsSupervisor === 1,
    selfRegistrable: row.selfRegistrable === 1,
    materials: materials.filter(material => material.moduleId === row.id).map(({ label, url }) => ({ label, url })),
    expiresIfAwardedToday: expiryFor(row as ExpiryPolicy, today, year),
    frozen: frozen.has(row.id),
  }))
}

export async function countAdminModules(clause: ListClause): Promise<number> {
  const [row] = await db.all<{ total: number }>(sql`SELECT count(*) AS total FROM modules m${predicate(clause)}`)
  return Number(row?.total ?? 0)
}
