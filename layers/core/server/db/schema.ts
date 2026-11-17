// The core's thirteen tables (Foundations part 2).
import { integer, text, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { defineTable, col } from '#kit/db'
import { identityTables } from './identity'

export const modules = defineTable('core_modules', {
  moduleId: col.internal(text('module_id').primaryKey()),
  enabled: col.internal(integer('enabled', { mode: 'boolean' }).notNull().default(false)),
  enabledAt: col.timestamp('enabled_at'),
  disabledAt: col.timestamp('disabled_at'),
  changedBy: col.account('changed_by', { role: 'actor', nullable: true }),
  manifestSeen: col.internal(text('manifest_seen')),
}, { realm: 'system' })

export const settings = defineTable('core_settings', {
  key: col.internal(text('key').primaryKey()),
  value: col.internal(text('value').notNull()),
  updatedAt: col.timestamp('updated_at').notNull(),
  updatedBy: col.account('updated_by', { role: 'actor', nullable: true }),
}, { realm: 'system' })

export const settingChanges = defineTable('core_setting_changes', {
  id: col.id(),
  key: col.internal(text('key').notNull()),
  oldValue: col.internal(text('old_value')),
  newValue: col.internal(text('new_value')),
  reason: col.freeText(text('reason')),
  at: col.timestamp('at').notNull(),
  actor: col.account('actor', { role: 'actor', onMerge: 'alias', nullable: true }),
}, { id: 'sch', realm: 'system', appendOnly: true, retention: 'core.retention.setting-changes', extra: t => [index('core_setting_changes_key').on(t.key, t.at)] })

export const migrations = defineTable('core_migrations', {
  owner: col.internal(text('owner').notNull()),
  name: col.internal(text('name').notNull()),
  checksum: col.internal(text('checksum').notNull()),
  appliedAt: col.timestamp('applied_at').notNull(),
  durationMs: col.internal(integer('duration_ms').notNull()),
  release: col.internal(text('release').notNull()),
}, { realm: 'system', appendOnly: true, extra: t => [primaryKey({ columns: [t.owner, t.name] })] })

export const events = defineTable('core_events', {
  id: col.id(),
  name: col.internal(text('name').notNull()),
  recordType: col.internal(text('record_type')),
  recordId: col.internal(text('record_id')),
  payload: col.internal(text('payload').notNull()),
  announcedAt: col.timestamp('announced_at').notNull(),
  unitId: col.internal(text('unit_id').notNull()),
  dispatchedAt: col.timestamp('dispatched_at'),
}, { id: 'evt', realm: 'system', extra: t => [index('core_events_name').on(t.name, t.announcedAt)] })

export const jobs = defineTable('core_jobs', {
  id: col.id(),
  kind: col.internal(text('kind').notNull()),
  name: col.internal(text('name').notNull()),
  moduleId: col.internal(text('module_id')),
  lane: col.internal(text('lane').notNull()),
  payload: col.internal(text('payload').notNull()),
  dedupeKey: col.internal(text('dedupe_key')),
  state: col.internal(text('state').notNull()),
  attempts: col.internal(integer('attempts').notNull().default(0)),
  // Times the job answered "not yet" (JobInfo.defer): never an attempt, and it sets the pause.
  deferrals: col.internal(integer('deferrals').notNull().default(0)),
  maxAttempts: col.internal(integer('max_attempts').notNull()),
  runAfter: col.timestamp('run_after').notNull(),
  lastError: col.internal(text('last_error')),
  createdAt: col.timestamp('created_at').notNull(),
  startedAt: col.timestamp('started_at'),
  finishedAt: col.timestamp('finished_at'),
}, {
  id: 'job',
  realm: 'system',
  extra: t => [
    uniqueIndex('core_jobs_dedupe').on(t.name, t.dedupeKey).where(sql`dedupe_key IS NOT NULL AND state IN ('queued', 'running')`),
    index('core_jobs_due').on(t.state, t.runAfter),
  ],
})

export const taskRuns = defineTable('core_task_runs', {
  task: col.internal(text('task').notNull()),
  dueAt: col.timestamp('due_at').notNull(),
  startedAt: col.timestamp('started_at'),
  finishedAt: col.timestamp('finished_at'),
  outcome: col.internal(text('outcome')),
  jobId: col.internal(text('job_id')),
}, { realm: 'system', extra: t => [primaryKey({ columns: [t.task, t.dueAt] })] })

export const externalCalls = defineTable('core_external_calls', {
  id: col.id(),
  moduleId: col.internal(text('module_id').notNull()),
  purpose: col.internal(text('purpose').notNull()),
  reference: col.internal(text('reference').notNull()),
  idempotencyKey: col.internal(text('idempotency_key').notNull()),
  phase: col.internal(text('phase').notNull()),
  result: col.internal(text('result')),
  providerReference: col.internal(text('provider_reference')),
  at: col.timestamp('at').notNull(),
}, {
  id: 'ext',
  realm: 'system',
  appendOnly: true,
  extra: t => [
    uniqueIndex('core_external_calls_attempt').on(t.idempotencyKey).where(sql`phase = 'attempt'`),
    uniqueIndex('core_external_calls_outcome').on(t.idempotencyKey).where(sql`phase = 'outcome' AND result != 'unknown'`),
  ],
})

export const audit = defineTable('core_audit', {
  id: col.id(),
  at: col.timestamp('at').notNull(),
  actorAccountId: col.account('actor_account_id', { role: 'actor', onMerge: 'alias', nullable: true }),
  actorName: col.personal(text('actor_name')),
  actorKind: col.internal(text('actor_kind').notNull()),
  action: col.internal(text('action').notNull()),
  ability: col.internal(text('ability')),
  allowedBy: col.internal(text('allowed_by')),
  moduleId: col.internal(text('module_id')),
  recordType: col.internal(text('record_type')),
  recordId: col.internal(text('record_id')),
  detail: col.internal(text('detail')),
  requestId: col.internal(text('request_id')),
  unitId: col.internal(text('unit_id')),
}, {
  id: 'aud',
  realm: 'system',
  appendOnly: true,
  retention: 'core.retention.audit',
  extra: t => [index('core_audit_record').on(t.recordType, t.recordId, t.at), index('core_audit_actor').on(t.actorAccountId, t.at)],
})

export const credentials = defineTable('core_credentials', {
  moduleId: col.internal(text('module_id').notNull()),
  name: col.internal(text('name').notNull()),
  // The record a scoped credential belongs to, such as a payment provider account; '' when it is the
  // module's one value.
  scope: col.internal(text('scope').notNull().default('')),
  ciphertext: col.internal(text('ciphertext').notNull()),
  keyVersion: col.internal(integer('key_version').notNull()),
  setAt: col.timestamp('set_at').notNull(),
  setBy: col.account('set_by', { role: 'actor', nullable: true }),
  lastUsedAt: col.timestamp('last_used_at'),
  expiresAt: col.timestamp('expires_at'),
  hint: col.internal(text('hint')),
}, { realm: 'system', extra: t => [primaryKey({ columns: [t.moduleId, t.name, t.scope] })] })

export const idempotencyKeys = defineTable('core_idempotency_keys', {
  key: col.internal(text('key').notNull()),
  route: col.internal(text('route').notNull()),
  accountId: col.account('account_id', { role: 'actor', nullable: true }),
  requestHash: col.internal(text('request_hash').notNull()),
  status: col.internal(integer('status').notNull()),
  response: col.personal(text('response'), { erase: 'clear' }),
  createdAt: col.timestamp('created_at').notNull(),
}, { realm: 'system', retention: 'core.idempotency.keep-for', extra: t => [primaryKey({ columns: [t.key, t.route] })] })

// The signing service's key pairs (F-37). The private part is sealed with CORE_ENCRYPTION_KEY, never
// leaves this table, and is erased once the key stops signing; the public part is kept for ever.
export const signingKeys = defineTable('core_signing_keys', {
  id: col.id(),
  purpose: col.internal(text('purpose').notNull()),
  publicKey: col.internal(text('public_key').notNull()),
  privateKey: col.internal(text('private_key'), { encrypted: true }),
  state: col.internal(text('state').notNull()),
  createdAt: col.timestamp('created_at').notNull(),
  checkingFrom: col.timestamp('checking_from'),
  retiredAt: col.timestamp('retired_at'),
}, {
  id: 'sgk',
  realm: 'system',
  extra: t => [
    uniqueIndex('core_signing_keys_current').on(t.purpose).where(sql`state = 'current'`),
    index('core_signing_keys_purpose').on(t.purpose, t.state),
  ],
})

export const guard = defineTable('core_guard', {
  ok: col.internal(integer('ok').notNull()),
  code: col.internal(text('code')),
}, { realm: 'system' })

export const tables = { modules, settings, settingChanges, migrations, events, jobs, taskRuns, externalCalls, audit, credentials, idempotencyKeys, signingKeys, guard, ...identityTables }
