import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './identity'

const now = sql`(unixepoch())`
const id = () => text('id').primaryKey()

// The department vocabulary is committee-editable, so it is a table rather than a CHECK: a
// constraint behind an editable list breaks writes the moment the list is used (0033, G-110).

export const departments = sqliteTable('departments', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  index('departments_is_active').on(table.isActive),
])

// A lead assignment, with provenance. Expiry is read at every leads-only surface and never swept:
// an assignment that lapsed overnight confers nothing on the next request (0009, G-110).
export const departmentLeads = sqliteTable('department_leads', {
  id: id(),
  department: text('department').notNull().references(() => departments.code, { onDelete: 'restrict' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // NULL is permanent; the default is the next 31 July, London (G-110 criterion 3).
  expiresAt: integer('expires_at'),
  grantedBy: text('granted_by').references(() => users.id, { onDelete: 'set null' }),
  grantedAt: integer('granted_at').notNull().default(now),
}, table => [
  unique('department_leads_person').on(table.department, table.userId),
  index('department_leads_user').on(table.userId),
  index('department_leads_expires_at').on(table.expiresAt),
])

// The catalogue. `id` is the published human id members quote, so it is the key itself and is
// immutable once created (G-107 criterion 1, docs/data-model.md).
export const trainingModules = sqliteTable('modules', {
  id: id(),
  department: text('department').notNull().references(() => departments.code, { onDelete: 'restrict' }),
  // Closed sets about process, so these carry CHECKs where the department vocabulary cannot (0033).
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  // Lead-only, so it is absent from the member-facing column list (G-107 criterion 5).
  notes: text('notes'),
  deliveryMode: text('delivery_mode').notNull().default('IN_PERSON'),
  expiryMode: text('expiry_mode').notNull().default('NONE'),
  expiryMonths: integer('expiry_months'),
  allowsExternal: integer('allows_external', { mode: 'boolean' }).notNull().default(false),
  externalEvidence: text('external_evidence'),
  safetyCritical: integer('safety_critical', { mode: 'boolean' }).notNull().default(false),
  signoffRequired: integer('signoff_required', { mode: 'boolean' }).notNull().default(false),
  // Frozen while unrevoked records exist (G-109). Standing derives from records, never from here.
  grantsTrainer: integer('grants_trainer', { mode: 'boolean' }).notNull().default(false),
  grantsSupervisor: integer('grants_supervisor', { mode: 'boolean' }).notNull().default(false),
  selfRegistrable: integer('self_registrable', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('DRAFT'),
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  index('modules_department').on(table.department),
  index('modules_status').on(table.status),
  check('modules_kind', sql`${table.kind} IN ('MODULE', 'CERTIFICATION', 'BRIEF')`),
  check('modules_delivery_mode', sql`${table.deliveryMode} IN ('IN_PERSON', 'SELF_DIRECTED', 'HYBRID')`),
  check('modules_expiry_mode', sql`${table.expiryMode} IN ('NONE', 'MONTHS', 'ACADEMIC_YEAR')`),
  check('modules_status', sql`${table.status} IN ('DRAFT', 'ACTIVE', 'RETIRED')`),
  // A months policy is the only one carrying a number, and it must carry one (G-123 criterion 1).
  check('modules_expiry_months', sql`(${table.expiryMode} = 'MONTHS') = (${table.expiryMonths} IS NOT NULL)`),
  // The cap is MAX_EXPIRY_MONTHS in shared/utils/training.ts, and the two move together only by
  // hand: widening it is a table rebuild, which is why it is worth stating twice (G-123 c4, 0033).
  check('modules_expiry_months_cap', sql`${table.expiryMonths} IS NULL OR (${table.expiryMonths} > 0 AND ${table.expiryMonths} <= 120)`),
  // A safety-critical module may never be fully self-directed (0018, G-107 criterion 2).
  check('modules_safety_critical_mode', sql`NOT (${table.safetyCritical} = 1 AND ${table.deliveryMode} = 'SELF_DIRECTED')`),
  // A brief teaches something once and carries no lifetime of its own (G-107 criterion 4).
  check('modules_brief_never_expires', sql`NOT (${table.kind} = 'BRIEF' AND ${table.expiryMode} <> 'NONE')`),
  check('modules_brief_grants_nothing', sql`NOT (${table.kind} = 'BRIEF' AND (${table.grantsTrainer} = 1 OR ${table.grantsSupervisor} = 1))`),
  // Self-registration is a brief's QR sign-in and nothing else's (G-208).
  check('modules_self_registrable_brief', sql`NOT (${table.selfRegistrable} = 1 AND ${table.kind} <> 'BRIEF')`),
])

// Zero or more links per module, owned by the module's department (G-107 criteria 1 and 5).
export const moduleMaterials = sqliteTable('module_materials', {
  id: id(),
  moduleId: text('module_id').notNull().references(() => trainingModules.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  url: text('url').notNull(),
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('module_materials_module').on(table.moduleId),
])

// Append-only and trigger-enforced (0010). Validity is worked out from these dates every time it
// is read and is never stored, so there is no state column here and never may be (0018, G-101).
export const trainingRecords = sqliteTable('training_records', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  moduleId: text('module_id').notNull().references(() => trainingModules.id, { onDelete: 'restrict' }),
  awardedOn: text('awarded_on').notNull(),
  // NULL is never. Stamped from the module's policy at award, and moved by G-124 alone.
  expiresOn: text('expires_on'),
  // An explicit expiry rather than the policy's, which is what makes G-124 skip this row.
  expiryOverridden: integer('expiry_overridden', { mode: 'boolean' }).notNull().default(false),
  source: text('source').notNull(),
  // No foreign key, now or ever: the sessions table is G-112's, and adding a key later is a
  // rebuild, which the append-only triggers make a refusal (0010).
  sessionId: text('session_id'),
  grantedBy: text('granted_by').references(() => users.id, { onDelete: 'set null' }),
  evidenceRef: text('evidence_ref'),
  revokedAt: integer('revoked_at'),
  revokedBy: text('revoked_by').references(() => users.id, { onDelete: 'set null' }),
  revokeReason: text('revoke_reason'),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  index('training_records_user_module').on(table.userId, table.moduleId),
  index('training_records_module').on(table.moduleId),
  // Marking one register twice awards one record per person per module (G-116, 0006). Bare column
  // names: a qualified reference is legal in a CHECK and not in a partial index's WHERE.
  uniqueIndex('training_records_session_award').on(table.sessionId, table.userId, table.moduleId)
    .where(sql`session_id is not null and revoked_at is null`),
  // Closed by 0018 and frozen by 0010: a sixth source would be a rebuild, so all five ship now.
  // LEGACY is vocabulary only and nothing writes it (G-127 resolved).
  check('training_records_source', sql`${table.source} IN ('SESSION', 'SIGNOFF', 'EXTERNAL', 'SELF', 'LEGACY')`),
  check('training_records_term', sql`${table.expiresOn} IS NULL OR ${table.expiresOn} > ${table.awardedOn}`),
  // No CHECK ties revoke_reason to revoked_at: erasure must be able to clear the reason, and a
  // CHECK on an append-only table can never be dropped. The reason is mandatory at the write path.
])
