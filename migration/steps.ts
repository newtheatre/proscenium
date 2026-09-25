// Every step of the import as a function over open databases, so build.ts runs them in one
// process and each transform-*.ts script is the same step run alone. Writes only under out/.
import type { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { transformBookings, reconcile as reconcileBookings } from './bookings'
import { transformCatalogue, reconcileCatalogue, PASS_ADMISSION_MAP_KEY } from './catalogue'
import { createCore, permanentItManagers, transformIdentity } from './identity'
import { OUT, ROOT, SOURCES, count, ensureOut, execDump, idFor, loadDump, readMap, sum, tables, writeJson, writeLines, writeMap } from './lib'
import { buildLoad, applyLoad, loadedCounts } from './load'
import { buildLoad as buildMoneyLoad, reconcileMoney, transformMoney } from './money'
import { transformPasses, reconcilePasses } from './passes'
import { transformProgramme, reconcile as reconcileProgramme } from './programme'
import { transformReservations, reconcile as reconcileReservations } from './reservations'
import { readRoleDecisions } from './review-roles'
import { transformTraining, reconcileTraining } from './training'
import type { Source } from './lib'
import type { TicketLink, TicketRow } from './money'
import type { RoleDecisions } from './role-decisions'

export type Dumps = Record<Source, Database>

// One transaction per step: the same all-or-nothing shape a D1 batch has, and the difference
// between five minutes of per-row commits and a few seconds.
export function inOne<T>(target: Database, run: () => T): T {
  return target.transaction(run)()
}

export async function openDumps(stamp: string): Promise<Dumps> {
  const dumps = {} as Dumps
  for (const source of SOURCES) dumps[source] = await loadDump(source, stamp)
  return dumps
}

export function closeDumps(dumps: Dumps): void {
  for (const source of SOURCES) dumps[source].close()
}

export interface StepResult {
  summary: Record<string, unknown>
  exceptions: string[]
  problems: string[]
}

export type Manifest = {
  stamp: string
  generatedAt: string
  sources: Record<string, { tables: Record<string, number>, checks: Record<string, number> }>
}

// Per-table counts and domain checksums for all four dumps: the baseline every check reads.
export async function stepInventory(stamp: string, dumps: Dumps): Promise<Manifest> {
  ensureOut()
  const manifest: Manifest = { stamp, generatedAt: new Date().toISOString(), sources: {} }
  for (const source of SOURCES) {
    const db = dumps[source]
    const tableCounts: Record<string, number> = {}
    for (const t of tables(db)) tableCounts[t] = count(db, t)
    const checks: Record<string, number> = {}
    if (source === 'auth') {
      checks.users_anonymised = count(db, 'users', 'email LIKE \'%@anonymised.invalid\'')
      checks.users_workspace_password = count(db, 'users', 'email LIKE \'%@newtheatre.org.uk\' AND password IS NOT NULL')
      checks.users_guests = count(db, 'users', 'password IS NULL AND google_sub IS NULL')
      checks.users_disabled = count(db, 'users', 'disabled = 1')
    }
    if (source === 'proscenium') {
      checks.tickets_unrefunded_pence = sum(db, 'tickets', 'price_paid', 'refunded_at IS NULL')
      checks.tickets_refunded = count(db, 'tickets', 'refunded_at IS NOT NULL')
      checks.reservations_by_pending = count(db, 'reservations', 'status = \'PENDING\'')
      checks.incident_log = count(db, 'incident_log')
      checks.age_checks = count(db, 'age_checks')
      checks.stock_movement_qty_sum = sum(db, 'stock_movements', 'qty')
    }
    if (source === 'rooms') {
      checks.bookings_confirmed = count(db, 'bookings', 'status = \'CONFIRMED\'')
      checks.bookings_open = count(db, 'bookings', 'status IN (\'PENDING\',\'AWAITING_EXTERNAL\')')
    }
    if (source === 'training') {
      checks.records_unrevoked = count(db, 'records', 'revoked_at IS NULL')
      checks.attendance_attended = count(db, 'session_attendees', 'status = \'ATTENDED\'')
    }
    manifest.sources[source] = { tables: tableCounts, checks }
  }
  await writeJson('manifest.json', manifest)

  let md = `# Migration inventory: dumps of ${stamp}\n`
  for (const [source, data] of Object.entries(manifest.sources)) {
    md += `\n## ${source}\n\n| Table | Rows |\n| --- | --- |\n`
    for (const [t, n] of Object.entries(data.tables)) md += `| ${t} | ${n} |\n`
    if (Object.keys(data.checks).length) {
      md += `\nChecks: ${Object.entries(data.checks).map(([k, v]) => `${k}=${v}`).join(' · ')}\n`
    }
  }
  await Bun.write(join(OUT, 'manifest.md'), md)
  return manifest
}

export const CORE_PATH = join(OUT, 'unified.sqlite')

// The identity core, checked against the manifest before anything is loaded (K-112, K-115).
export async function stepIdentity(stamp: string, dumps: Dumps, manifest: Manifest, decisions?: RoleDecisions): Promise<StepResult & { core: Database }> {
  ensureOut()
  if (await Bun.file(CORE_PATH).exists()) await Bun.file(CORE_PATH).delete()
  const core = await createCore(CORE_PATH)
  const idMap = await readMap('id-map.tsv')
  const reused = idMap.size
  const mirrors = (['rooms', 'training', 'proscenium'] as const).map(source => ({ source, db: dumps[source] }))
  const decided = decisions ?? await readRoleDecisions()

  const { summary, exceptions, undecided } = transformIdentity({ auth: dumps.auth, mirrors, decisions: decided, idMap, target: core })
  await writeMap('id-map.tsv', idMap)
  await writeLines('exceptions.txt', exceptions)
  const full = { stamp, reusedIds: reused, ...summary, undecided, exceptions: exceptions.length }
  await writeJson('transform-summary.json', full)

  const problems = checkIdentity(manifest, full, core)
  return { summary: full, exceptions, problems, core }
}

// The invariants a green identity rehearsal proves (K-112, K-115, 0008, 0015, 0030); each line
// names what broke so the fix goes into the transform, never into the numbers.
export function checkIdentity(manifest: Manifest, summary: Record<string, unknown>, core: Database): string[] {
  const failures: string[] = []
  const check = (name: string, ok: boolean, detail: string) => {
    if (!ok) failures.push(`${name} (${detail})`)
  }
  const src = manifest.sources
  const s = summary as { workspaceWiped: number, grantsImported: number, grantsCollapsed: number, grantsSkipped: number, emailsLowercased: number, undecided: string[] }
  check('users count', count(core, 'users') === src.auth!.tables.users, `${count(core, 'users')} vs ${src.auth!.tables.users}`)
  check('tombstones preserved', count(core, 'users', 'anonymised_at IS NOT NULL') === src.auth!.checks.users_anonymised, `${count(core, 'users', 'anonymised_at IS NOT NULL')} vs ${src.auth!.checks.users_anonymised}`)
  check('no Workspace passwords', count(core, 'users', 'email LIKE \'%@newtheatre.org.uk\' AND password IS NOT NULL') === 0, `wiped ${s.workspaceWiped}`)
  check('wipe count matches source', s.workspaceWiped === src.auth!.checks.users_workspace_password, `${s.workspaceWiped} vs ${src.auth!.checks.users_workspace_password}`)
  check('totp carried', count(core, 'totp_secrets') === src.auth!.tables.totp_secrets, `${count(core, 'totp_secrets')} vs ${src.auth!.tables.totp_secrets}`)
  check('recovery codes carried', count(core, 'recovery_codes') === src.auth!.tables.mfa_recovery_codes, `${count(core, 'recovery_codes')} vs ${src.auth!.tables.mfa_recovery_codes}`)
  check('grants accounted for', s.grantsImported + s.grantsCollapsed + s.grantsSkipped === src.auth!.tables.user_roles, `${s.grantsImported} imported + ${s.grantsCollapsed} collapsed + ${s.grantsSkipped} skipped vs ${src.auth!.tables.user_roles}`)
  check('old audit history not imported', core.query('SELECT name FROM sqlite_master WHERE name = ?').all('audit_archive').length === 0, '0030')
  check('every live old grant has a decision', s.undecided.length === 0, s.undecided.length ? `${s.undecided.length} undecided: run bun run migration:review-roles` : 'all decided')
  check('an IT Manager grant is permanent', permanentItManagers(core) > 0, 'every one would lapse with nobody left to grant another (A-120): run bun run migration:review-roles')
  check('no old estate ids in granted_by', count(core, 'role_grants', 'granted_by IS NOT NULL AND granted_by NOT IN (SELECT id FROM users)') === 0, '0015')
  check('every address is lowercase', count(core, 'users', 'email != lower(email)') === 0, `${s.emailsLowercased} normalised`)
  check('K-115 guard: incident register still empty', src.proscenium!.checks.incident_log === 0, `${src.proscenium!.checks.incident_log} rows`)
  check('K-115 guard: age-check register still empty', src.proscenium!.checks.age_checks === 0, `${src.proscenium!.checks.age_checks} rows`)
  return failures
}

export async function stepLoad(core: Database, target: Database): Promise<StepResult> {
  const sql = buildLoad(core)
  await Bun.write(join(OUT, 'load.sql'), sql)
  applyLoad(sql, target)
  return { summary: loadedCounts(target), exceptions: [], problems: [] }
}

export async function stepCatalogue(dumps: Dumps, target: Database): Promise<StepResult> {
  const roomIds = await readMap('room-id-map.tsv')
  const spaceIds = await readMap('space-id-map.tsv')
  const ticketTypeIds = await readMap('ticket-type-id-map.tsv')
  const input = { rooms: dumps.rooms, training: dumps.training, proscenium: dumps.proscenium, roomIds, spaceIds, ticketTypeIds, target }
  const { summary, exceptions } = inOne(target, () => transformCatalogue(input))
  await writeMap('room-id-map.tsv', roomIds)
  await writeMap('space-id-map.tsv', spaceIds)
  await writeMap('ticket-type-id-map.tsv', ticketTypeIds)
  await writeLines('catalogue-exceptions.txt', exceptions)
  const check = reconcileCatalogue(input, summary)
  await writeJson('catalogue-summary.json', { ...summary, problems: check.problems })
  return { summary: { ...summary }, exceptions, problems: check.problems }
}

// A shadow account (0071) standing for the booker the old rooms app no longer names: it can never
// sign in, is hidden from the directory, and says on its face what it is.
export const UNRECORDED_BOOKER_EMAIL = 'rooms-import@legacy.invalid'

export function unrecordedBooker(target: Database, placeholders: Map<string, string>): string {
  const id = idFor(placeholders, 'rooms:unrecorded-booker')
  target.query(`
    INSERT INTO users (id, email, name, verified, disabled, created_at, updated_at)
    VALUES (?, ?, 'Rooms app (booker not recorded)', 0, 0, unixepoch(), unixepoch())
    ON CONFLICT (id) DO NOTHING
  `).run(id, UNRECORDED_BOOKER_EMAIL)
  writeMap('placeholder-id-map.tsv', placeholders)
  return id
}

export async function stepBookings(dumps: Dumps, target: Database): Promise<StepResult> {
  const accounts = await readMap('id-map.tsv')
  const rooms = await readMap('room-id-map.tsv')
  const spaces = await readMap('space-id-map.tsv')
  if (rooms.size === 0) throw new Error('no room-id-map.tsv: run the catalogue step first')
  const bookingIds = await readMap('booking-id-map.tsv')
  const seriesIds = await readMap('series-id-map.tsv')
  const externalIds = await readMap('external-id-map.tsv')
  const unrecordedBookerId = unrecordedBooker(target, await readMap('placeholder-id-map.tsv'))
  const { summary, exceptions } = inOne(target, () => transformBookings({ source: dumps.rooms, accounts, rooms, spaces, bookingIds, seriesIds, externalIds, unrecordedBookerId, target }))
  const check = reconcileBookings(dumps.rooms, target, summary)
  await writeMap('booking-id-map.tsv', bookingIds)
  await writeMap('series-id-map.tsv', seriesIds)
  await writeMap('external-id-map.tsv', externalIds)
  await writeLines('booking-exceptions.txt', exceptions)
  await writeJson('booking-summary.json', { ...summary, problems: check.problems })
  return { summary: { ...summary }, exceptions, problems: check.problems }
}

export async function stepTraining(dumps: Dumps, target: Database): Promise<StepResult> {
  const accounts = await readMap('id-map.tsv')
  const sessionIds = await readMap('training-session-id-map.tsv')
  const requestIds = await readMap('module-request-id-map.tsv')
  const recordIds = await readMap('training-record-id-map.tsv')
  const moduleIds = new Set(target.query<{ id: string }, []>('SELECT id FROM modules').all().map(row => row.id))
  const departmentCodes = new Set(target.query<{ code: string }, []>('SELECT code FROM departments').all().map(row => row.code))
  if (moduleIds.size === 0 || departmentCodes.size === 0) throw new Error('no training catalogue in the target: run the catalogue step first')
  const { summary, exceptions } = inOne(target, () => transformTraining({ source: dumps.training, accounts, moduleIds, departmentCodes, sessionIds, requestIds, recordIds, target }))
  const check = reconcileTraining(target, summary)
  await writeMap('training-session-id-map.tsv', sessionIds)
  await writeMap('module-request-id-map.tsv', requestIds)
  await writeMap('training-record-id-map.tsv', recordIds)
  await writeLines('training-exceptions.txt', exceptions)
  await writeJson('training-summary.json', { ...summary, problems: check.problems })
  return { summary: { ...summary }, exceptions, problems: check.problems }
}

export async function stepProgramme(dumps: Dumps, target: Database): Promise<StepResult> {
  const venueIds = await readMap('venue-id-map.tsv')
  const seasonIds = await readMap('season-id-map.tsv')
  const categoryIds = await readMap('category-id-map.tsv')
  const showIds = await readMap('show-id-map.tsv')
  const warningIds = await readMap('warning-id-map.tsv')
  const performanceIds = await readMap('performance-map.tsv')
  const posterKeys = await readMap('poster-key-map.tsv')
  const ticketTypeIds = await readMap('ticket-type-id-map.tsv')
  const { summary, exceptions } = inOne(target, () => transformProgramme({
    source: dumps.proscenium, venueIds, seasonIds, categoryIds, showIds, warningIds, performanceIds, posterKeys,
    ticketTypeIds: ticketTypeIds.size ? ticketTypeIds : undefined, target,
  }))
  const check = reconcileProgramme(dumps.proscenium, target, summary)
  await writeMap('venue-id-map.tsv', venueIds)
  await writeMap('season-id-map.tsv', seasonIds)
  await writeMap('category-id-map.tsv', categoryIds)
  await writeMap('show-id-map.tsv', showIds)
  await writeMap('warning-id-map.tsv', warningIds)
  await writeMap('performance-map.tsv', performanceIds)
  await writeLines('programme-exceptions.txt', exceptions)
  await writeJson('programme-summary.json', { ...summary, problems: check.problems })
  return { summary: { ...summary }, exceptions, problems: check.problems }
}

interface OldTicketType { id: string, name: string, kind: string }

// Reservations, their seats, and the passes reconstructed from the seats that were really pass
// sales or pass admissions (0073), in one step because the second reads the first's output.
export async function stepReservations(dumps: Dumps, target: Database): Promise<StepResult> {
  const source = dumps.proscenium
  const accounts = await readMap('id-map.tsv')
  const performances = await readMap('performance-map.tsv')
  const ticketTypes = await readMap('ticket-type-id-map.tsv')
  if (performances.size === 0) throw new Error('no performance-map.tsv: run the programme step first')
  if (ticketTypes.size === 0) throw new Error('no ticket-type-id-map.tsv: run the catalogue step first')
  const reservationIds = await readMap('reservation-id-map.tsv')
  const ticketIds = await readMap('reservation-ticket-id-map.tsv')

  const oldTypes = source.query<OldTicketType, []>('SELECT id, name, kind FROM ticket_types').all()
  const passSaleTypes = new Set(oldTypes.filter(type => type.kind === 'PASS_SALE').map(type => type.id))
  const passAdmissionTypes = new Set(oldTypes.filter(type => type.kind === 'PASS_ADMISSION').map(type => type.id))

  const result = inOne(target, () => transformReservations({
    source, accounts, performances, ticketTypes, reservationIds, ticketIds,
    passSaleTypes, passAdmissionTypes, passAdmissionTicketTypeId: ticketTypes.get(PASS_ADMISSION_MAP_KEY) ?? null, target,
  }))
  const check = reconcileReservations(source, target, result.summary)
  await writeMap('reservation-id-map.tsv', reservationIds)
  await writeMap('reservation-ticket-id-map.tsv', ticketIds)

  const passTypeIds = await readMap('pass-type-id-map.tsv')
  const passPriceIds = await readMap('pass-price-id-map.tsv')
  const passIds = await readMap('pass-id-map.tsv')
  const admissionIds = await readMap('pass-admission-id-map.tsv')
  const performanceRows = target.query<{ id: string, starts_at: number, show_id: string }, []>('SELECT id, starts_at, show_id FROM performances').all()
  const passesInput = {
    sales: result.passSales, admissions: result.passAdmissions, oldTicketTypes: oldTypes,
    performances: new Map(performanceRows.map(row => [row.id, { startsAt: row.starts_at, showId: row.show_id }])),
    passTypeIds, passPriceIds, passIds, admissionIds, target,
  }
  const passes = inOne(target, () => transformPasses(passesInput))
  const passCheck = reconcilePasses(target, passesInput, passes.summary)
  await writeMap('pass-type-id-map.tsv', passTypeIds)
  await writeMap('pass-price-id-map.tsv', passPriceIds)
  await writeMap('pass-id-map.tsv', passIds)
  await writeMap('pass-admission-id-map.tsv', admissionIds)

  const exceptions = [...result.exceptions, ...passes.exceptions]
  const problems = [...check.problems, ...passCheck.problems]
  await writeLines('reservation-exceptions.txt', exceptions)
  await writeJson('reservation-summary.json', { ...result.summary, passes: passes.summary, problems })
  return { summary: { ...result.summary, passes: passes.summary }, exceptions, problems }
}

export async function stepMoney(dumps: Dumps, target: Database): Promise<StepResult> {
  const source = dumps.proscenium
  const idMap = await readMap('money-id-map.tsv')
  const refundIdMap = await readMap('money-refund-id-map.tsv')
  const reservationIds = await readMap('reservation-id-map.tsv')
  const ticketIds = await readMap('reservation-ticket-id-map.tsv')
  const performances = await readMap('performance-map.tsv')

  const tickets = source.query<TicketRow & { reservation_id: string, performance_id: string }, []>(
    'SELECT id, price_paid, refunded_at, created_at, price_confidence, reservation_id, performance_id FROM tickets',
  ).all()
  // A seat this build imported names its performance on the ledger; a pass sale names none.
  const links = new Map<string, TicketLink>()
  for (const ticket of tickets) {
    const ticketId = ticketIds.get(ticket.id)
    const reservationId = reservationIds.get(ticket.reservation_id)
    const performanceId = performances.get(ticket.performance_id)
    if (ticketId && reservationId && performanceId) links.set(ticket.id, { ticketId, reservationId, performanceId })
  }

  const { entries, lines, summary, exceptions } = transformMoney(tickets, idMap, refundIdMap, links)
  await writeMap('money-id-map.tsv', idMap)
  await writeMap('money-refund-id-map.tsv', refundIdMap)
  const sql = buildMoneyLoad(entries, lines)
  await Bun.write(join(OUT, 'load-money.sql'), sql)
  execDump(target, sql)
  const check = reconcileMoney(source, target, summary)
  await writeLines('money-exceptions.txt', exceptions)
  await writeJson('money-summary.json', { ...summary, linked: links.size, problems: check.problems })
  return { summary: { ...summary, linked: links.size }, exceptions, problems: check.problems }
}

// Row counts of the built target, the figure reset-production.sh compares production against.
export function targetCounts(target: Database): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const table of tables(target)) counts[table] = count(target, table)
  counts._hub_migrations = count(target, '_hub_migrations')
  return counts
}

export { idFor, ROOT }
