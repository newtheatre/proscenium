import { and, asc, desc, eq, gt, inArray, isNull, lte, not, or, sql } from 'drizzle-orm'
import { isMonthDay, londonParts } from '#shared/utils/london'
import { previewStatement, restatableCount } from '#shared/utils/recalculation'
import type { PreviewRow } from '#shared/utils/recalculation'
import { MAX_PREREQUISITE_DEPTH, expiryFor, leadsDepartment, missingPrerequisites, saysGaps } from '#shared/utils/training'
import type { AcademicYear, ExpiryMode, ExpiryPolicy, LeadAssignment, ModuleInput } from '#shared/utils/training'
import type { Authority } from '#server/utils/authorise'
import type { SQL, SQLWrapper } from 'drizzle-orm'
import type { H3Event } from 'h3'

// Reading and writing the training catalogue. Nothing here writes a validity, a standing or a
// count: every such answer is derived from dates at the moment it is asked for (0018).

export interface DepartmentRow {
  code: string
  name: string
  description: string | null
  isActive: boolean
  sort: number
  leads: LeadRow[]
}

export interface LeadRow {
  id: string
  userId: string
  name: string
  expiresAt: number | null
}

// Column allow-lists, so a note meant for leads cannot reach a member-facing response.
const DEPARTMENT_COLUMNS = {
  code: schema.departments.code,
  name: schema.departments.name,
  description: schema.departments.description,
  isActive: schema.departments.isActive,
  sort: schema.departments.sort,
}

const MODULE_COLUMNS = {
  id: schema.trainingModules.id,
  department: schema.trainingModules.department,
  kind: schema.trainingModules.kind,
  name: schema.trainingModules.name,
  description: schema.trainingModules.description,
  deliveryMode: schema.trainingModules.deliveryMode,
  expiryMode: schema.trainingModules.expiryMode,
  expiryMonths: schema.trainingModules.expiryMonths,
  allowsExternal: schema.trainingModules.allowsExternal,
  externalEvidence: schema.trainingModules.externalEvidence,
  safetyCritical: schema.trainingModules.safetyCritical,
  signoffRequired: schema.trainingModules.signoffRequired,
  grantsTrainer: schema.trainingModules.grantsTrainer,
  grantsSupervisor: schema.trainingModules.grantsSupervisor,
  selfRegistrable: schema.trainingModules.selfRegistrable,
  status: schema.trainingModules.status,
  sort: schema.trainingModules.sort,
}

const liveLead = (now: Date) => or(
  isNull(schema.departmentLeads.expiresAt),
  gt(schema.departmentLeads.expiresAt, Math.floor(now.getTime() / 1000)),
)

export interface SessionRow {
  id: string
  heldOn: string
  startsAt: string
  endsAt: string
  place: string | null
  capacity: number
  opensAt: number | null
  status: string
  trainerId: string
  trainerName: string
  modules: { id: string, name: string }[]
}

// Sessions with what each teaches. Soonest first, because a trainer's next one is the one they
// came to look at.
export async function listSessions(filter: { status?: string, trainerId?: string }): Promise<SessionRow[]> {
  const wanted = and(
    filter.status ? eq(schema.trainingSessions.status, filter.status) : undefined,
    filter.trainerId ? eq(schema.trainingSessions.trainerId, filter.trainerId) : undefined,
  )

  const rows = await db.select({
    id: schema.trainingSessions.id,
    heldOn: schema.trainingSessions.heldOn,
    startsAt: schema.trainingSessions.startsAt,
    endsAt: schema.trainingSessions.endsAt,
    place: schema.trainingSessions.place,
    capacity: schema.trainingSessions.capacity,
    opensAt: schema.trainingSessions.opensAt,
    status: schema.trainingSessions.status,
    trainerId: schema.trainingSessions.trainerId,
    trainerName: schema.users.name,
  })
    .from(schema.trainingSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.trainingSessions.trainerId))
    .where(wanted)
    .orderBy(asc(schema.trainingSessions.heldOn), asc(schema.trainingSessions.startsAt))

  // Scoped by repeating the predicate as a subquery, so nothing binds a parameter per session.
  const taught = await db.select({
    sessionId: schema.sessionModules.sessionId,
    id: schema.trainingModules.id,
    name: schema.trainingModules.name,
  })
    .from(schema.sessionModules)
    .innerJoin(schema.trainingModules, eq(schema.trainingModules.id, schema.sessionModules.moduleId))
    .where(inArray(
      schema.sessionModules.sessionId,
      db.select({ id: schema.trainingSessions.id }).from(schema.trainingSessions).where(wanted),
    ))

  return rows.map(row => ({
    ...row,
    modules: taught.filter(module => module.sessionId === row.id).map(({ id, name }) => ({ id, name })),
  }))
}

// Trainer standing exists if and only if somebody currently holds a valid or expiring record on a
// module flagged trainer-granting. Never a role, never a flag, so nothing needs revoking (G-111).
export async function trainerStandingOf(userId: string, today: string): Promise<{ trainer: boolean, supervisor: boolean }> {
  const rows = await db.select({
    trainer: schema.trainingModules.grantsTrainer,
    supervisor: schema.trainingModules.grantsSupervisor,
  })
    .from(schema.trainingRecords)
    .innerJoin(schema.trainingModules, eq(schema.trainingModules.id, schema.trainingRecords.moduleId))
    .where(and(
      eq(schema.trainingRecords.userId, userId),
      heldNow(today),
      or(eq(schema.trainingModules.grantsTrainer, true), eq(schema.trainingModules.grantsSupervisor, true)),
    ))

  return {
    trainer: rows.some(row => row.trainer),
    supervisor: rows.some(row => row.supervisor),
  }
}

// A trainer surface. Standing dies the moment the record behind it expires or is revoked, so this
// is read at the request and cached nowhere (G-111 criterion 2).
export async function requireTrainer(event: H3Event): Promise<Authority> {
  const resolved = await authority(event)

  // The training officer runs the catalogue and may act without holding a certification.
  if (!resolved.permissions.has('training.write')) {
    const standing = await trainerStandingOf(resolved.account.id, londonToday())
    if (!standing.trainer) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Running a session needs a current trainer certification',
      })
    }
  }

  await requireSecondFactorIfPrivileged(event, resolved)
  return resolved
}

// Whether the proposed prerequisite already leads back to the module, and by which path. A
// recursive walk, so nothing binds a parameter per edge and no id list is built (0003, G-108 c2).
export async function cyclePath(moduleId: string, requiresId: string): Promise<string | null> {
  const found = await db.all<{ path: string }>(sql`
    with recursive reaches(module_id, path, depth) as (
      select ${requiresId}, ${requiresId}, 0
      union all
      select p.requires_id, r.path || ' -> ' || p.requires_id, r.depth + 1
      from module_prerequisites p join reaches r on p.module_id = r.module_id
      where r.depth < ${MAX_PREREQUISITE_DEPTH}
        and instr(' -> ' || r.path || ' -> ', ' -> ' || p.requires_id || ' -> ') = 0
    )
    select path from reaches where module_id = ${moduleId} limit 1
  `)
  return found[0]?.path ?? null
}

// A module's direct prerequisites, with the module each one names. Direct edges only: there is no
// transitive expression anywhere in this system (G-108 criterion 1).
export async function prerequisitesOf(moduleIds: string[]): Promise<Map<string, PrerequisiteRow[]>> {
  if (moduleIds.length === 0) return new Map()

  const rows = await db.select({
    id: schema.modulePrerequisites.id,
    moduleId: schema.modulePrerequisites.moduleId,
    requiresId: schema.modulePrerequisites.requiresId,
    requiresName: schema.trainingModules.name,
    requiresKind: schema.trainingModules.kind,
  })
    .from(schema.modulePrerequisites)
    .innerJoin(schema.trainingModules, eq(schema.trainingModules.id, schema.modulePrerequisites.requiresId))
    .orderBy(asc(schema.modulePrerequisites.requiresId))

  const byModule = new Map<string, PrerequisiteRow[]>()
  for (const row of rows.filter(row => moduleIds.includes(row.moduleId))) {
    byModule.set(row.moduleId, [...(byModule.get(row.moduleId) ?? []), row])
  }
  return byModule
}

export interface PrerequisiteRow {
  id: string
  moduleId: string
  requiresId: string
  requiresName: string
  requiresKind: string
}

// Which modules somebody currently holds, expiring included, as a set the caller can ask of any
// prerequisite (G-108 criterion 5, G-101 criterion 3).
export async function modulesHeldBy(userId: string, today: string): Promise<Set<string>> {
  const rows = await db.select({ moduleId: schema.trainingRecords.moduleId })
    .from(schema.trainingRecords)
    .where(and(eq(schema.trainingRecords.userId, userId), heldNow(today)))
  return new Set(rows.map(row => row.moduleId))
}

// The SQL twin of countsAsHeld. Expiring is held, so the warning window cancels out and no gate
// query ever reads it: held is unrevoked and not yet at its expiry date (G-101 criterion 3).
export function heldNow(today: string) {
  return and(
    isNull(schema.trainingRecords.revokedAt),
    or(isNull(schema.trainingRecords.expiresOn), gt(schema.trainingRecords.expiresOn, today)),
  )
}

export interface RecordRow {
  id: string
  moduleId: string
  moduleName: string
  department: string
  kind: string
  awardedOn: string
  expiresOn: string | null
  source: string
  revokedAt: number | null
  createdAt: number
}

const RECORD_COLUMNS = {
  id: schema.trainingRecords.id,
  moduleId: schema.trainingRecords.moduleId,
  moduleName: schema.trainingModules.name,
  department: schema.trainingModules.department,
  kind: schema.trainingModules.kind,
  awardedOn: schema.trainingRecords.awardedOn,
  expiresOn: schema.trainingRecords.expiresOn,
  source: schema.trainingRecords.source,
  revokedAt: schema.trainingRecords.revokedAt,
  createdAt: schema.trainingRecords.createdAt,
}

// Somebody's own records, newest award first. Revoked ones are the caller's to filter: a member
// never sees them and a lead's history view is the only place they show (G-101 criterion 6).
export async function recordsFor(userId: string, includeRevoked = false): Promise<RecordRow[]> {
  return db.select(RECORD_COLUMNS).from(schema.trainingRecords)
    .innerJoin(schema.trainingModules, eq(schema.trainingModules.id, schema.trainingRecords.moduleId))
    .where(and(
      eq(schema.trainingRecords.userId, userId),
      includeRevoked ? undefined : isNull(schema.trainingRecords.revokedAt),
    ))
    .orderBy(desc(schema.trainingRecords.awardedOn), desc(schema.trainingRecords.createdAt))
}

// One record, with what a revocation needs to name it on the trail.
export async function recordById(id: string): Promise<
  { id: string, userId: string, moduleId: string, revokedAt: number | null } | undefined
> {
  const [row] = await db.select({
    id: schema.trainingRecords.id,
    userId: schema.trainingRecords.userId,
    moduleId: schema.trainingRecords.moduleId,
    revokedAt: schema.trainingRecords.revokedAt,
  }).from(schema.trainingRecords).where(eq(schema.trainingRecords.id, id)).limit(1)
  return row
}

// The departments somebody currently leads, as a predicate rather than as a list of ids.
function ledBy(userId: string, now: Date) {
  return inArray(
    schema.trainingModules.department,
    db.select({ department: schema.departmentLeads.department }).from(schema.departmentLeads)
      .where(and(eq(schema.departmentLeads.userId, userId), liveLead(now))),
  )
}

// Live assignments only: an assignment that lapsed overnight confers nothing on this request, and
// no sweep had to run first (G-110 criteria 3 and 4).
export async function liveLeads(userId: string, now = new Date()): Promise<LeadAssignment[]> {
  return db.select({ department: schema.departmentLeads.department, expiresAt: schema.departmentLeads.expiresAt })
    .from(schema.departmentLeads)
    .where(and(eq(schema.departmentLeads.userId, userId), liveLead(now)))
}

export async function listDepartments(
  includeInactive: boolean,
  leadOf?: string,
  now = new Date(),
): Promise<DepartmentRow[]> {
  const wanted = and(
    includeInactive ? undefined : eq(schema.departments.isActive, true),
    leadOf
      ? inArray(schema.departments.code, db.select({ department: schema.departmentLeads.department })
          .from(schema.departmentLeads)
          .where(and(eq(schema.departmentLeads.userId, leadOf), liveLead(now))))
      : undefined,
  )
  const rows = await db.select(DEPARTMENT_COLUMNS).from(schema.departments).where(wanted)
    .orderBy(asc(schema.departments.sort), asc(schema.departments.code))

  const leads = await db.select({
    id: schema.departmentLeads.id,
    department: schema.departmentLeads.department,
    userId: schema.departmentLeads.userId,
    name: schema.users.name,
    expiresAt: schema.departmentLeads.expiresAt,
  })
    .from(schema.departmentLeads)
    .innerJoin(schema.users, eq(schema.users.id, schema.departmentLeads.userId))
    .where(liveLead(now))
    .orderBy(asc(schema.users.name))

  return rows.map(row => ({
    ...row,
    leads: leads.filter(lead => lead.department === row.code)
      .map(({ id, userId, name, expiresAt }) => ({ id, userId, name, expiresAt })),
  }))
}

export async function departmentByCode(code: string): Promise<{ code: string, name: string } | undefined> {
  const [row] = await db.select({ code: schema.departments.code, name: schema.departments.name })
    .from(schema.departments).where(eq(schema.departments.code, code)).limit(1)
  return row
}

export interface ModuleRow {
  id: string
  department: string
  kind: string
  name: string
  description: string | null
  notes?: string | null
  deliveryMode: string
  expiryMode: string
  expiryMonths: number | null
  allowsExternal: boolean
  externalEvidence: string | null
  safetyCritical: boolean
  signoffRequired: boolean
  grantsTrainer: boolean
  grantsSupervisor: boolean
  selfRegistrable: boolean
  status: string
  sort: number
  materials: { label: string, url: string }[]
  // Derived on the way out, so a later policy change moves this and no stored date (G-123).
  expiresIfAwardedToday: string | null
  // Whether its kind and granting flags are frozen. Asked of the records, never stored (G-109).
  frozen?: boolean
}

export interface ModuleFilter {
  department?: string
  status?: string
  includeDrafts: boolean
  includeRetired: boolean
  // Set for a reader whose only standing is a lead assignment: they see their departments and no
  // others. Scoped by subquery, never by an id list, so no parameter count grows (0003).
  leadOf?: string
}

// Today's London day, which is what an award would be dated (0014).
export function londonToday(now = new Date()): string {
  const { year, month, day } = londonParts(now)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function statusFilter(filter: ModuleFilter) {
  if (filter.status) return eq(schema.trainingModules.status, filter.status)
  const hidden = [
    filter.includeDrafts ? null : 'DRAFT',
    filter.includeRetired ? null : 'RETIRED',
  ].filter(value => value !== null)
  if (hidden.length === 0) return undefined
  return and(...hidden.map(status => not(eq(schema.trainingModules.status, status))))
}

export async function listModules(
  filter: ModuleFilter,
  year: AcademicYear,
  leadOnly: boolean,
  now = new Date(),
): Promise<ModuleRow[]> {
  // Lead-only notes join the allow-list for a leads screen and never for a member-facing one.
  const columns = leadOnly ? { ...MODULE_COLUMNS, notes: schema.trainingModules.notes } : MODULE_COLUMNS
  const wanted = and(
    filter.department ? eq(schema.trainingModules.department, filter.department) : undefined,
    filter.leadOf ? ledBy(filter.leadOf, now) : undefined,
    statusFilter(filter),
  )
  const rows = await db.select(columns).from(schema.trainingModules)
    .where(wanted)
    .orderBy(asc(schema.trainingModules.sort), asc(schema.trainingModules.id))

  // Scoped to the modules being returned by repeating their predicate as a subquery, so this does
  // not fetch every link in the database to answer for a page of modules (0003).
  const materials = await db.select({
    moduleId: schema.moduleMaterials.moduleId,
    label: schema.moduleMaterials.label,
    url: schema.moduleMaterials.url,
  }).from(schema.moduleMaterials)
    .where(inArray(
      schema.moduleMaterials.moduleId,
      db.select({ id: schema.trainingModules.id }).from(schema.trainingModules).where(wanted),
    ))
    .orderBy(asc(schema.moduleMaterials.sort))

  // Which modules may no longer change their safety semantics, scoped by the same subquery as the
  // materials so no parameter count grows with the page (0003, G-109). A member never asks.
  const frozen = leadOnly
    ? new Set((await db.selectDistinct({ moduleId: schema.trainingRecords.moduleId })
        .from(schema.trainingRecords)
        .where(and(
          isNull(schema.trainingRecords.revokedAt),
          inArray(
            schema.trainingRecords.moduleId,
            db.select({ id: schema.trainingModules.id }).from(schema.trainingModules).where(wanted),
          ),
        ))).map(record => record.moduleId))
    : null

  const today = londonToday(now)
  return rows.map(row => ({
    ...row,
    materials: materials.filter(material => material.moduleId === row.id)
      .map(({ label, url }) => ({ label, url })),
    expiresIfAwardedToday: expiryFor(row as ExpiryPolicy, today, year),
    ...(frozen ? { frozen: frozen.has(row.id) } : {}),
  }))
}

export interface ModuleHeader {
  id: string
  department: string
  name: string
  kind: string
  grantsTrainer: boolean
  grantsSupervisor: boolean
}

// The policy a sign-off stamps from, with the lifecycle and kind its refusals turn on.
export async function modulePolicy(id: string): Promise<
  (ExpiryPolicy & { kind: string, status: string, allowsExternal: boolean }) | undefined
> {
  const [row] = await db.select({
    expiryMode: schema.trainingModules.expiryMode,
    expiryMonths: schema.trainingModules.expiryMonths,
    kind: schema.trainingModules.kind,
    status: schema.trainingModules.status,
    allowsExternal: schema.trainingModules.allowsExternal,
  }).from(schema.trainingModules).where(eq(schema.trainingModules.id, id)).limit(1)
  return row as (ExpiryPolicy & { kind: string, status: string, allowsExternal: boolean }) | undefined
}

export async function moduleById(id: string): Promise<ModuleHeader | undefined> {
  const [row] = await db.select({
    id: schema.trainingModules.id,
    department: schema.trainingModules.department,
    name: schema.trainingModules.name,
    kind: schema.trainingModules.kind,
    grantsTrainer: schema.trainingModules.grantsTrainer,
    grantsSupervisor: schema.trainingModules.grantsSupervisor,
  }).from(schema.trainingModules).where(eq(schema.trainingModules.id, id)).limit(1)
  return row
}

// Unrevoked, never "currently valid": an expired record was still awarded under the semantics the
// freeze protects (G-109). One bound parameter whatever the module carries (0003).
export async function recordsExistAgainst(moduleId: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.trainingRecords.id })
    .from(schema.trainingRecords)
    .where(and(
      eq(schema.trainingRecords.moduleId, moduleId),
      isNull(schema.trainingRecords.revokedAt),
    ))
    .limit(1)
  return row !== undefined
}

// The academic year an award would be measured against, read live so a settings change takes
// effect without a release (0012).
export async function academicYear(event: H3Event): Promise<AcademicYear> {
  const boundary = await configValue(event, 'ACADEMIC_YEAR_BOUNDARY')

  // An override stored before the boundary was validated would otherwise surface as a bare 500
  // from whatever asked for an expiry next (G-123 criterion 5).
  if (!isMonthDay(boundary)) {
    throw createError({
      statusCode: 503,
      statusMessage: `ACADEMIC_YEAR_BOUNDARY is set to ${boundary}, which is not a day of every year`,
    })
  }

  return { boundary, carryOverDays: await configValue(event, 'TRAINING_CARRY_OVER_DAYS') }
}

export interface CatalogueAuthority extends Authority {
  leads: LeadAssignment[]
}

// Reading is the officer's or a lead's. A lead holds no role at all, so a guard asking only for a
// permission would leave them able to write a catalogue they cannot see (G-110 criterion 2).
export async function requireCatalogueReader(event: H3Event): Promise<CatalogueAuthority> {
  const resolved = await authority(event)
  const leads = await liveLeads(resolved.account.id)

  if (!resolved.permissions.has('training.read') && leads.length === 0) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to do that' })
  }

  await requireSecondFactorIfPrivileged(event, resolved)
  return { ...resolved, leads }
}

// Whose catalogue a reader may see: everybody's for an officer, their own for a lead.
export function scopeToLeadOf(resolved: CatalogueAuthority): string | undefined {
  return resolved.permissions.has('training.read') ? undefined : resolved.account.id
}

// Standing is settled before a body is read: a guard that validated first would tell somebody with
// no business here which fields exist and what they must look like.
export async function requireCatalogueAuthority(event: H3Event): Promise<CatalogueAuthority> {
  const resolved = await authority(event)
  const leads = await liveLeads(resolved.account.id)

  if (!resolved.permissions.has('training.write') && leads.length === 0) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to do that' })
  }

  await requireSecondFactorIfPrivileged(event, resolved)
  return { ...resolved, leads }
}

// Editing a department's catalogue is the training officer's, or that department's live leads'.
// Standing is read at the request and cached nowhere (G-110 criteria 2 and 4).
export function assertStewards(resolved: CatalogueAuthority, department: string): void {
  if (resolved.permissions.has('training.write')) return
  if (leadsDepartment(resolved.leads, department, new Date())) return
  throw createError({ statusCode: 403, statusMessage: 'You do not have permission to do that' })
}

export type AwardablePolicy = ExpiryPolicy & { kind: string, status: string, allowsExternal: boolean }

// Every refusal an award outside a register makes before it writes, shared so a sign-off and a
// certificate cannot drift apart (G-120 criteria 1 to 3, G-121 criterion 5).
export async function assertAwardable(
  resolved: CatalogueAuthority,
  input: { userId: string, moduleId: string, awardedOn: string },
  refusals: { retired: string, brief: string },
): Promise<AwardablePolicy> {
  const module = await moduleById(input.moduleId)
  if (!module) throw createError({ statusCode: 404, statusMessage: 'No such module' })

  assertStewards(resolved, module.department)

  const account = await findById(input.userId)
  if (!account) throw createError({ statusCode: 404, statusMessage: 'No such account' })
  if (account.anonymisedAt !== null) {
    throw createError({ statusCode: 409, statusMessage: 'That account has been erased' })
  }

  const policy = await modulePolicy(input.moduleId)
  if (!policy) throw createError({ statusCode: 404, statusMessage: 'No such module' })
  if (policy.status === 'RETIRED') throw createError({ statusCode: 409, statusMessage: refusals.retired })
  if (policy.kind === 'BRIEF') throw createError({ statusCode: 409, statusMessage: refusals.brief })

  // A future award would read as valid to every gate between now and then.
  const today = londonToday()
  if (input.awardedOn > today) {
    throw createError({ statusCode: 422, statusMessage: 'An award cannot be dated in the future' })
  }

  // Expiring counts as held, and the refusal names the gaps. No acknowledgement path exists for
  // any kind, which the criterion demands of a certification.
  const needed = (await prerequisitesOf([input.moduleId])).get(input.moduleId) ?? []
  const held = await modulesHeldBy(input.userId, today)
  const gaps = missingPrerequisites(needed, held)
  if (gaps.length > 0) {
    throw createError({ statusCode: 422, statusMessage: `Not held yet: ${saysGaps(gaps)}` })
  }

  return policy
}

export interface TeachableModule {
  id: string
  name: string
  department: string
  safetyCritical: boolean
  expiryMode: ExpiryMode
  expiryMonths: number | null
}

// What may be taught, and by whom: active, not proved by experience rather than by a room, and
// held by whoever teaches it. The officer is exempt, acting on a trainer's behalf (G-112 c3, c4).
export async function assertTeachable(
  resolved: Authority,
  moduleIds: string[],
  today: string,
): Promise<TeachableModule[]> {
  const taught = await db.select({
    id: schema.trainingModules.id,
    name: schema.trainingModules.name,
    department: schema.trainingModules.department,
    safetyCritical: schema.trainingModules.safetyCritical,
    expiryMode: schema.trainingModules.expiryMode,
    expiryMonths: schema.trainingModules.expiryMonths,
    status: schema.trainingModules.status,
    signoffRequired: schema.trainingModules.signoffRequired,
  }).from(schema.trainingModules)
    .where(inArray(schema.trainingModules.id, moduleIds))
    .orderBy(asc(schema.trainingModules.sort), asc(schema.trainingModules.id))

  const missing = moduleIds.filter(id => !taught.some(module => module.id === id))
  if (missing.length > 0) {
    throw createError({ statusCode: 404, statusMessage: `No such module: ${missing.join(', ')}` })
  }

  const refused = taught.filter(module => module.status !== 'ACTIVE' || module.signoffRequired)
  if (refused.length > 0) {
    throw createError({
      statusCode: 422,
      statusMessage: `Cannot be taught by session: ${refused.map(module => `${module.id} ${module.name}`).join(', ')}`,
    })
  }

  // Question 4's answer: a trainer teaches what they hold, scoped by competence not department.
  if (!resolved.permissions.has('training.write')) {
    const held = await modulesHeldBy(resolved.account.id, today)
    const unheld = taught.filter(module => !held.has(module.id))
    if (unheld.length > 0) {
      throw createError({
        statusCode: 422,
        statusMessage: `You do not hold: ${unheld.map(module => `${module.id} ${module.name}`).join(', ')}`,
      })
    }
  }

  return taught.map(module => ({
    id: module.id,
    name: module.name,
    department: module.department,
    safetyCritical: module.safetyCritical,
    expiryMode: module.expiryMode as ExpiryMode,
    expiryMonths: module.expiryMonths,
  }))
}

// A set of ids passed as one JSON parameter, so a predicate covering a room binds one parameter
// rather than one per person (0003).
export function inJsonSet(column: SQLWrapper, values: readonly string[]): SQL {
  return sql`${column} in (select value from json_each(${JSON.stringify(values)}))`
}

// What a write actually puts in the row, so the create and the edit cannot drift apart.
export function moduleValues(input: ModuleInput) {
  return {
    department: input.department,
    kind: input.kind,
    name: input.name,
    description: input.description,
    notes: input.notes,
    deliveryMode: input.deliveryMode,
    expiryMode: input.expiryMode,
    expiryMonths: input.expiryMonths,
    allowsExternal: input.allowsExternal,
    externalEvidence: input.externalEvidence,
    safetyCritical: input.safetyCritical,
    signoffRequired: input.signoffRequired,
    grantsTrainer: input.grantsTrainer,
    grantsSupervisor: input.grantsSupervisor,
    selfRegistrable: input.selfRegistrable,
    status: input.status,
    sort: input.sort,
  }
}

// How many records a recalculation would restate, as it stands now. Read at the preview and again
// after a refused run, so the figure quoted back is the one that refused it (G-124 criterion 3).
export async function countRestatable(
  moduleId: string,
  policy: ExpiryPolicy,
  year: AcademicYear,
): Promise<number> {
  const found = await db.all<{ n: number }>(restatableCount(moduleId, policy, year))
  return found[0]?.n ?? 0
}

// Every affected record, with the date standing and the date the policy would put there. Paged in
// SQL, and scoped by predicate rather than by an id list (0003, G-124 criterion 2).
export async function previewRestatable(
  moduleId: string,
  policy: ExpiryPolicy,
  year: AcademicYear,
  limit: number,
  offset: number,
): Promise<PreviewRow[]> {
  return db.all<PreviewRow>(previewStatement(moduleId, policy, year, limit, offset))
}

export interface NextStep {
  id: string
  name: string
  department: string
  kind: string
  safetyCritical: boolean
  deliveryMode: string
}

// What a member could take next: active modules they do not currently hold whose every direct
// prerequisite they do. Two nested subqueries, so no parameter count grows with the ladder (0003).
export async function whatsNextFor(userId: string, today: string): Promise<NextStep[]> {
  return db.all<NextStep>(sql`
    select m.id, m.name, m.department, m.kind, m.safety_critical as safetyCritical,
      m.delivery_mode as deliveryMode
    from modules m
    where m.status = 'ACTIVE'
      and not exists (
        select 1 from training_records r
        where r.user_id = ${userId} and r.module_id = m.id and r.revoked_at is null
          and (r.expires_on is null or r.expires_on > ${today})
      )
      and not exists (
        select 1 from module_prerequisites p
        join modules req on req.id = p.requires_id
        where p.module_id = m.id and req.kind != 'BRIEF'
          and not exists (
            select 1 from training_records held
            where held.user_id = ${userId} and held.module_id = p.requires_id
              and held.revoked_at is null
              and (held.expires_on is null or held.expires_on > ${today})
          )
      )
    order by m.sort, m.id
  `)
}

export interface ModuleRequestRow {
  id: string
  moduleId: string
  moduleName: string
  department: string
  note: string | null
  status: string
  reason: string | null
  createdAt: number
}

export async function requestsBy(userId: string): Promise<ModuleRequestRow[]> {
  return db.select({
    id: schema.moduleRequests.id,
    moduleId: schema.moduleRequests.moduleId,
    moduleName: schema.trainingModules.name,
    department: schema.trainingModules.department,
    note: schema.moduleRequests.note,
    status: schema.moduleRequests.status,
    reason: schema.moduleRequests.reason,
    createdAt: schema.moduleRequests.createdAt,
  })
    .from(schema.moduleRequests)
    .innerJoin(schema.trainingModules, eq(schema.trainingModules.id, schema.moduleRequests.moduleId))
    .where(eq(schema.moduleRequests.userId, userId))
    .orderBy(desc(schema.moduleRequests.createdAt))
}

export interface DemandRow {
  moduleId: string
  moduleName: string
  department: string
  waiting: number
  // `id` is the request's, not the person's: it is what answering acts on.
  requesters: { id: string, userId: string, name: string, note: string | null }[]
}

// The board a lead answers, busiest first. Scoped by subquery when the reader is a lead rather
// than an officer, so no parameter count grows with how many departments they steward (0003).
export async function demandBoard(leadOf: string | undefined, limit = 20): Promise<DemandRow[]> {
  const scope = leadOf === undefined
    ? sql`1 = 1`
    : sql`m.department in (
        select department from department_leads
        where user_id = ${leadOf} and (expires_at is null or expires_at > unixepoch()))`

  const modules = await db.all<{ moduleId: string, moduleName: string, department: string, waiting: number }>(sql`
    select r.module_id as moduleId, m.name as moduleName, m.department as department,
      count(*) as waiting
    from module_requests r
    join modules m on m.id = r.module_id
    where r.status = 'OPEN' and ${scope}
    group by r.module_id, m.name, m.department
    order by count(*) desc, m.name
    limit ${limit}
  `)

  if (modules.length === 0) return []

  // The requesters for the page of modules being shown, fetched by repeating the predicate as a
  // subquery rather than by an id list built from the rows above (0003).
  const people = await db.all<{ moduleId: string, id: string, userId: string, name: string, note: string | null }>(sql`
    select r.module_id as moduleId, r.id as id, u.id as userId, u.name as name, r.note as note
    from module_requests r
    join users u on u.id = r.user_id
    join modules m on m.id = r.module_id
    where r.status = 'OPEN' and ${scope}
      and r.module_id in (
        select module_id from module_requests inner_r
        join modules inner_m on inner_m.id = inner_r.module_id
        where inner_r.status = 'OPEN' and ${scope}
        group by module_id
        order by count(*) desc, inner_m.name
        limit ${limit})
    order by r.created_at
  `)

  const byModule = new Map<string, DemandRow['requesters']>()
  for (const row of people) {
    byModule.set(row.moduleId, [...(byModule.get(row.moduleId) ?? []),
      { id: row.id, userId: row.userId, name: row.name, note: row.note }])
  }
  return modules.map(module => ({ ...module, requesters: byModule.get(module.moduleId) ?? [] }))
}

// Criterion 4. A session that members can see resolves the asks it answers, and each requester
// hears once. A session created but not yet open resolves nothing: nobody can sign up to it yet.
export async function resolveRequestsFor(
  event: H3Event | undefined,
  sessionId: string,
  moduleIds: string[],
): Promise<number> {
  const waiting = await db.all<{ id: string, userId: string, moduleId: string, moduleName: string }>(sql`
    select r.id as id, r.user_id as userId, r.module_id as moduleId, m.name as moduleName
    from module_requests r
    join modules m on m.id = r.module_id
    where r.status = 'OPEN'
      and r.module_id in (select value from json_each(${JSON.stringify(moduleIds)}))
  `)
  if (waiting.length === 0) return 0

  await db.run(sql`
    update module_requests
    set status = 'SCHEDULED', decided_at = unixepoch()
    where status = 'OPEN'
      and module_id in (select value from json_each(${JSON.stringify(moduleIds)}))
  `)

  let told = 0
  for (const row of waiting) {
    const took = await claimNotification({
      userId: row.userId,
      type: 'training.request.scheduled',
      key: `training.request.scheduled:${row.id}`,
      sessionId,
    })
    if (!took) continue

    await notify(event, {
      type: 'training.request.scheduled',
      userId: row.userId,
      context: {
        name: '',
        moduleName: row.moduleName,
        moduleId: row.moduleId,
        sessionsUrl: `${useRuntimeConfig(event).public.baseURL}/training`,
      },
    })
    told++
  }
  return told
}

export interface PracticeTargetRow {
  key: string
  name: string
  description: string | null
  windowHours: number
  isActive: boolean
  moduleIds: string[]
}

export async function listPracticeTargets(): Promise<PracticeTargetRow[]> {
  const targets = await db.select({
    key: schema.practiceTargets.key,
    name: schema.practiceTargets.name,
    description: schema.practiceTargets.description,
    windowHours: schema.practiceTargets.windowHours,
    isActive: schema.practiceTargets.isActive,
  }).from(schema.practiceTargets).orderBy(asc(schema.practiceTargets.key))

  const links = await db.select({
    targetKey: schema.practiceTargetModules.targetKey,
    moduleId: schema.practiceTargetModules.moduleId,
  }).from(schema.practiceTargetModules).orderBy(asc(schema.practiceTargetModules.moduleId))

  const byTarget = new Map<string, string[]>()
  for (const row of links) byTarget.set(row.targetKey, [...(byTarget.get(row.targetKey) ?? []), row.moduleId])
  return targets.map(target => ({ ...target, moduleIds: byTarget.get(target.key) ?? [] }))
}

// Criterion 4. Read from the table every time and never cached: the old estate served this
// no-store, because practice access is enforced rather than advisory.
export async function practiceOpenFor(userId: string, targetKey: string, at: number): Promise<boolean> {
  const found = await db.select({ id: schema.practiceWindows.id })
    .from(schema.practiceWindows)
    .where(and(
      eq(schema.practiceWindows.userId, userId),
      eq(schema.practiceWindows.targetKey, targetKey),
      isNull(schema.practiceWindows.closedAt),
      lte(schema.practiceWindows.opensAt, at),
      gt(schema.practiceWindows.expiresAt, at),
    ))
    .limit(1)
  return found.length > 0
}

// Criterion 3. Closing lapsed windows is the only thing the sweep does; it never opens one and
// never touches a record.
export async function closeLapsedPractice(at: number): Promise<number> {
  const closed = await db.update(schema.practiceWindows)
    .set({ closedAt: at })
    .where(and(isNull(schema.practiceWindows.closedAt), lte(schema.practiceWindows.expiresAt, at)))
    .returning({ id: schema.practiceWindows.id })
  return closed.length
}

// G-115 criterion 3, and the old estate's duplicate-window bug. One window per placed member per
// matching active target, and the partial unique index is what makes a second attempt a no-op.
export async function openPracticeWindowsFor(
  sessionId: string,
  openedBy: string,
  at: number,
): Promise<number> {
  const targets = await db.all<{ key: string, windowHours: number }>(sql`
    select distinct t.key as key, t.window_hours as windowHours
    from practice_targets t
    join practice_target_modules m on m.target_key = t.key
    join session_modules sm on sm.module_id = m.module_id
    where sm.session_id = ${sessionId} and t.is_active = 1
  `)
  if (targets.length === 0) return 0

  const { placed } = await placesOnSession(sessionId)
  if (placed.length === 0) return 0

  // One insert per target, each covering every placed member, so the statement count follows the
  // targets rather than the room: the people go in as one JSON parameter (0003).
  let opened = 0
  for (const target of targets) {
    const written = await db.all<{ id: string }>(sql`
      insert into practice_windows (id, target_key, user_id, session_id, opens_at, expires_at, opened_by)
      select lower(hex(randomblob(16))), ${target.key}, value, ${sessionId}, ${at},
        ${at + target.windowHours * 3600}, ${openedBy}
      from json_each(${JSON.stringify(placed.map(place => place.userId))})
      where true
      on conflict do nothing
      returning id
    `)
    opened += written.length
  }
  return opened
}
