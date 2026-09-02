import { and, asc, desc, eq, gt, inArray, isNull, not, or, sql } from 'drizzle-orm'
import { isMonthDay, londonParts } from '#shared/utils/london'
import { MAX_PREREQUISITE_DEPTH, expiryFor, leadsDepartment } from '#shared/utils/training'
import type { AcademicYear, ExpiryPolicy, LeadAssignment, ModuleInput } from '#shared/utils/training'
import type { Authority } from '#server/utils/authorise'
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
