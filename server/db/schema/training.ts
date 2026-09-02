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

// A planned session. `held_on` is the London day it happens; the wall-clock times are stored as
// text so no instant is implied and a clock change cannot move them (0014, G-112 criterion 5).
export const trainingSessions = sqliteTable('training_sessions', {
  id: id(),
  heldOn: text('held_on').notNull(),
  // HH:MM, zero-padded, so they compare and sort as strings, the way room hours do.
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at').notNull(),
  place: text('place'),
  capacity: integer('capacity').notNull(),
  // NULL is open already. A session invisible to members resolves no requests (criterion 2).
  opensAt: integer('opens_at'),
  status: text('status').notNull().default('PLANNED'),
  notes: text('notes'),
  trainerId: text('trainer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  // Opening the register freezes what the session teaches and closes sign-up. Stamped once by a
  // conditional write, so two devices opening it produce one open register (G-115 criterion 4).
  registerOpenedAt: integer('register_opened_at'),
  registerOpenedBy: text('register_opened_by').references(() => users.id, { onDelete: 'set null' }),
  // When the marks landed. The single act that awards, and it happens once (G-116).
  markedAt: integer('marked_at'),
  markedBy: text('marked_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  index('training_sessions_held_on').on(table.heldOn),
  index('training_sessions_status').on(table.status),
  index('training_sessions_trainer').on(table.trainerId),
  index('training_sessions_register_opened_at').on(table.registerOpenedAt),
  check('training_sessions_status', sql`${table.status} IN ('PLANNED', 'OPEN', 'FULL', 'DELIVERED', 'CANCELLED')`),
  // A closed set about process, so it may carry a CHECK (0033). One to sixty is the room a
  // workshop can hold, and nought would be a session nobody may attend (criterion 1).
  check('training_sessions_capacity', sql`${table.capacity} BETWEEN 1 AND 60`),
  check('training_sessions_span', sql`${table.endsAt} > ${table.startsAt}`),
])

// What a session teaches. One or more, and frozen once the register opens (G-115 criterion 2).
export const sessionModules = sqliteTable('session_modules', {
  id: id(),
  sessionId: text('session_id').notNull().references(() => trainingSessions.id, { onDelete: 'cascade' }),
  moduleId: text('module_id').notNull().references(() => trainingModules.id, { onDelete: 'restrict' }),
}, table => [
  unique('session_modules_pair').on(table.sessionId, table.moduleId),
  index('session_modules_module').on(table.moduleId),
])

// Direct edges only, and a cycle is refused at the write by naming it (G-108). No `created_by`:
// a column ending `_by` would demand a personal-data entry for a table that names nobody.
export const modulePrerequisites = sqliteTable('module_prerequisites', {
  id: id(),
  moduleId: text('module_id').notNull().references(() => trainingModules.id, { onDelete: 'cascade' }),
  requiresId: text('requires_id').notNull().references(() => trainingModules.id, { onDelete: 'restrict' }),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  unique('module_prerequisites_edge').on(table.moduleId, table.requiresId),
  index('module_prerequisites_requires').on(table.requiresId),
  check('module_prerequisites_not_self', sql`${table.moduleId} <> ${table.requiresId}`),
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

// A member asking to be taught something. A demand signal and nothing else: it confers no queue
// position, no priority and no place in any session (G-104 criterion 5).
export const moduleRequests = sqliteTable('module_requests', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  moduleId: text('module_id').notNull().references(() => trainingModules.id, { onDelete: 'cascade' }),
  note: text('note'),
  status: text('status').notNull().default('OPEN'),
  // What the lead wrote back. The requester is shown it, so it is a reply rather than a verdict.
  reason: text('reason'),
  decidedBy: text('decided_by').references(() => users.id, { onDelete: 'set null' }),
  decidedAt: integer('decided_at'),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  // Criterion 1, in the database rather than in a handler: one open request per person per
  // module, and withdrawing frees the re-ask because a withdrawn row leaves the index.
  uniqueIndex('module_requests_open').on(table.userId, table.moduleId).where(sql`status = 'OPEN'`),
  index('module_requests_module_status').on(table.moduleId, table.status),
  index('module_requests_user').on(table.userId),
  check('module_requests_status', sql`${table.status} IN ('OPEN', 'SCHEDULED', 'DECLINED', 'WITHDRAWN')`),
])

// A practice surface somebody may rehearse on once they have been taught it, for example the till
// sandbox. The key is immutable once created, because consumers reference it (G-126 criterion 1).
export const practiceTargets = sqliteTable('practice_targets', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  // How long a window lasts once opened, in hours.
  windowHours: integer('window_hours').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, table => [
  index('practice_targets_is_active').on(table.isActive),
  check('practice_targets_window_hours', sql`${table.windowHours} BETWEEN 1 AND 8760`),
])

export const practiceTargetModules = sqliteTable('practice_target_modules', {
  id: id(),
  targetKey: text('target_key').notNull().references(() => practiceTargets.key, { onDelete: 'cascade' }),
  moduleId: text('module_id').notNull().references(() => trainingModules.id, { onDelete: 'cascade' }),
}, table => [
  unique('practice_target_modules_pair').on(table.targetKey, table.moduleId),
  index('practice_target_modules_module').on(table.moduleId),
])

// An open window to rehearse on a surface. Access is enforced from this table and never cached:
// the old estate served it no-store, and advisory practice access is not access control (0126 c4).
export const practiceWindows = sqliteTable('practice_windows', {
  id: id(),
  targetKey: text('target_key').notNull().references(() => practiceTargets.key, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // No foreign key: a window outlives the session that opened it, and G-115 enforces the link.
  sessionId: text('session_id'),
  opensAt: integer('opens_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  closedAt: integer('closed_at'),
  closedBy: text('closed_by').references(() => users.id, { onDelete: 'set null' }),
  openedBy: text('opened_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull().default(now),
}, table => [
  // Criterion 2, and the old estate's bug: two devices opening one register must not open two
  // windows. One open window per person, target and session, held by the index rather than a read.
  uniqueIndex('practice_windows_claim').on(table.targetKey, table.userId, table.sessionId)
    .where(sql`session_id is not null`),
  index('practice_windows_user').on(table.userId),
  index('practice_windows_expires_at').on(table.expiresAt),
])
