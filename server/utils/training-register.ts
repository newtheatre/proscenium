import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { expiryFor } from '#shared/utils/training'
import { saysDayLong } from '#shared/utils/when'
import type { AttendanceMark } from '#shared/utils/training'
import type { H3Event } from 'h3'

// G-116. Marking is the single act that awards, so everything happens in one batch guarded on our
// own stamp: the loser of a race writes nothing rather than half an award set.

export interface RegisterRow {
  attendeeId: string
  userId: string
  name: string
  source: string
  status: string
}

export async function registerFor(sessionId: string): Promise<RegisterRow[]> {
  return db.select({
    attendeeId: schema.sessionAttendees.id,
    userId: schema.sessionAttendees.userId,
    name: schema.users.name,
    source: schema.sessionAttendees.source,
    status: schema.sessionAttendees.status,
  })
    .from(schema.sessionAttendees)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessionAttendees.userId))
    .where(and(
      eq(schema.sessionAttendees.sessionId, sessionId),
      ne(schema.sessionAttendees.status, 'CANCELLED'),
    ))
    .orderBy(asc(schema.sessionAttendees.signedUpAt), asc(schema.sessionAttendees.id))
}

export interface TaughtModule {
  id: string
  name: string
  expiryMode: string
  expiryMonths: number | null
}

export async function modulesTaughtBy(sessionId: string): Promise<TaughtModule[]> {
  return db.select({
    id: schema.trainingModules.id,
    name: schema.trainingModules.name,
    expiryMode: schema.trainingModules.expiryMode,
    expiryMonths: schema.trainingModules.expiryMonths,
  })
    .from(schema.sessionModules)
    .innerJoin(schema.trainingModules, eq(schema.trainingModules.id, schema.sessionModules.moduleId))
    .where(eq(schema.sessionModules.sessionId, sessionId))
    .orderBy(asc(schema.trainingModules.id))
}

// Seven columns a record row carries here, so twelve rows is 84 parameters and stays inside D1's
// hundred (0003). The same chunk size the delivery log uses, for the same reason.
const RECORD_COLUMNS = 7
const RECORDS_PER_STATEMENT = Math.floor(90 / RECORD_COLUMNS)

export interface MarkRun {
  event: H3Event | undefined
  sessionId: string
  heldOn: string
  markedBy: string
  marks: { userId: string, mark: AttendanceMark }[]
  modules: TaughtModule[]
}

export async function markRegister(run: MarkRun): Promise<{ won: boolean, awarded: number }> {
  const year = await academicYear(run.event as H3Event)
  const present = run.marks.filter(mark => mark.mark === 'ATTENDED').map(mark => mark.userId)

  // Criterion 3. A present mark awards one record per module the session teaches, dated to the
  // held-on day; an absent mark produces no record of any kind.
  const rows = present.flatMap(userId => run.modules.map(module => ({
    id: newId(),
    userId,
    moduleId: module.id,
    awardedOn: run.heldOn,
    expiresOn: expiryFor({ expiryMode: module.expiryMode as never, expiryMonths: module.expiryMonths }, run.heldOn, year),
    sessionId: run.sessionId,
    grantedBy: run.markedBy,
  })))

  const now = Math.floor(Date.now() / 1000)
  // Criterion 4. Guarded on the stamp being ours rather than on the register being unmarked: our
  // own first statement marks it, so an unmarked predicate refuses the rest of its own batch.
  const ours = sql`(select 1 from training_sessions
    where id = ${run.sessionId} and marked_at = ${now} and marked_by = ${run.markedBy})`

  const statements = [
    db.run(sql`
      update training_sessions
      set marked_at = ${now}, marked_by = ${run.markedBy}, status = 'DELIVERED', updated_at = ${now}
      where id = ${run.sessionId} and marked_at is null
    `),
    ...run.marks.map(mark => db.run(sql`
      update session_attendees
      set status = ${mark.mark}, marked_at = ${now}, marked_by = ${run.markedBy}
      where session_id = ${run.sessionId} and user_id = ${mark.userId} and exists ${ours}
    `)),
    ...chunk(rows, RECORDS_PER_STATEMENT).map(part => db.run(sql`
      insert into training_records (id, user_id, module_id, awarded_on, expires_on, source, session_id, granted_by)
      select value ->> 'id', value ->> 'userId', value ->> 'moduleId', value ->> 'awardedOn',
        value ->> 'expiresOn', 'SESSION', value ->> 'sessionId', value ->> 'grantedBy'
      from json_each(${JSON.stringify(part)})
      where exists ${ours}
    `)),
    db.run(sql`
      insert into audit_log (id, actor_id, action, target, detail)
      select ${newId()}, ${run.markedBy}, 'register.marked', ${`session:${run.sessionId}`},
        ${JSON.stringify({ present: present.length, absent: run.marks.length - present.length, records: rows.length })}
      where exists ${ours}
    `),
  ]

  await db.batch(statements as never)

  // The stamp is what decides the race, so it is read back rather than assumed.
  const [after] = await db.select({ markedAt: schema.trainingSessions.markedAt, markedBy: schema.trainingSessions.markedBy })
    .from(schema.trainingSessions)
    .where(eq(schema.trainingSessions.id, run.sessionId))
    .limit(1)

  const won = after?.markedAt === now && after?.markedBy === run.markedBy
  return { won, awarded: won ? rows.length : 0 }
}

// The refusal names which of the three ways the cover failed, because "that did not work" is not
// something a trainer on a door can act on.
export function saysCoverage(
  problem: { strangers: string[], duplicates: string[], missing: string[] },
  onRegister: { userId: string, name: string }[],
): string {
  const named = (ids: string[]): string =>
    ids.map(id => onRegister.find(row => row.userId === id)?.name ?? id).join(', ')

  const parts: string[] = []
  if (problem.missing.length > 0) parts.push(`not marked: ${named(problem.missing)}`)
  if (problem.duplicates.length > 0) parts.push(`marked twice: ${named(problem.duplicates)}`)
  if (problem.strangers.length > 0) parts.push(`not on this register: ${named(problem.strangers)}`)
  return `The register has to be covered exactly. ${parts.join('; ')}`
}

export interface CorrectionRun extends MarkRun {
  reason: string
}

export interface Correction {
  awarded: number
  revoked: number
  added: string[]
  dropped: string[]
  at: number
}

// G-114 criterion 2, as amended by 0241. One batch, touching only the people whose mark moved: a
// record whose mark stands is left alone, so the history shows one row per person, not a pair.
export async function correctRegister(run: CorrectionRun): Promise<Correction> {
  const year = await academicYear(run.event as H3Event)
  const present = run.marks.filter(mark => mark.mark === 'ATTENDED').map(mark => mark.userId)
  const before = new Set((await registerFor(run.sessionId)).filter(row => row.status === 'ATTENDED').map(row => row.userId))
  const added = present.filter(userId => !before.has(userId))
  const dropped = [...before].filter(userId => !present.includes(userId))

  // Criterion 5. The award is dated to the day the session was held, not the day it was put right.
  const rows = added.flatMap(userId => run.modules.map(module => ({
    id: newId(),
    userId,
    moduleId: module.id,
    awardedOn: run.heldOn,
    expiresOn: expiryFor({ expiryMode: module.expiryMode as never, expiryMonths: module.expiryMonths }, run.heldOn, year),
    sessionId: run.sessionId,
    grantedBy: run.markedBy,
  })))

  const now = Math.floor(Date.now() / 1000)
  const living = await db.select({ id: schema.trainingRecords.id })
    .from(schema.trainingRecords)
    .where(and(
      eq(schema.trainingRecords.sessionId, run.sessionId),
      sql`revoked_at is null`,
      inJsonSet(schema.trainingRecords.userId, dropped),
    ))

  await db.batch([
    // Revoked first: the partial unique index counts only live rows, so somebody dropped and the
    // set issued can never collide. One parameter for the people, however many (0003).
    db.run(sql`
      update training_records
      set revoked_at = ${now}, revoked_by = ${run.markedBy}, revoke_reason = ${run.reason}
      where session_id = ${run.sessionId} and revoked_at is null
        and user_id in (select value from json_each(${JSON.stringify(dropped)}))
    `),
    ...run.marks.map(mark => db.run(sql`
      update session_attendees
      set status = ${mark.mark}, marked_at = ${now}, marked_by = ${run.markedBy}
      where session_id = ${run.sessionId} and user_id = ${mark.userId}
    `)),
    ...chunk(rows, RECORDS_PER_STATEMENT).map(part => db.run(sql`
      insert into training_records (id, user_id, module_id, awarded_on, expires_on, source, session_id, granted_by)
      select value ->> 'id', value ->> 'userId', value ->> 'moduleId', value ->> 'awardedOn',
        value ->> 'expiresOn', 'SESSION', value ->> 'sessionId', value ->> 'grantedBy'
      from json_each(${JSON.stringify(part)})
    `)),
    // Criterion 6. The diff, and the actor, in the same batch as the writes it describes.
    db.run(sql`
      insert into audit_log (id, actor_id, action, target, detail)
      values (${newId()}, ${run.markedBy}, 'register.corrected', ${`session:${run.sessionId}`},
        ${JSON.stringify({
          heldOn: run.heldOn,
          present: present.length,
          absent: run.marks.length - present.length,
          revoked: living.length,
          issued: rows.length,
        })})
    `),
  ] as never)

  return { awarded: rows.length, revoked: living.length, added, dropped, at: now }
}

function chunk<T>(items: T[], size: number): T[][] {
  const parts: T[][] = []
  for (let index = 0; index < items.length; index += size) parts.push(items.slice(index, index + size))
  return parts
}

// Who held a place they signed up for, read before marking moves anybody's status. Somebody only
// ever on the waiting list, or a walk-in the trainer unticked, was never expected (0241).
export async function expectedOn(sessionId: string): Promise<Set<string>> {
  const signedUp = new Set((await registerFor(sessionId)).filter(row => row.source === 'SIGNUP').map(row => row.userId))
  return new Set((await placesOnSession(sessionId)).placed.map(place => place.userId).filter(id => signedUp.has(id)))
}

// Criterion 3's other half. Somebody expected and marked absent hears why nothing landed on their
// record, and the copy makes clear nothing has been held against them.
export async function tellAbsentees(
  event: H3Event | undefined,
  sessionId: string,
  heldOn: string,
  marks: { userId: string, mark: AttendanceMark }[],
  expected: Set<string>,
  modules: { name: string }[],
): Promise<number> {
  let told = 0
  for (const mark of marks) {
    if (mark.mark !== 'ABSENT' || !expected.has(mark.userId)) continue
    const key = `training.session.absent:${sessionId}:${mark.userId}`
    const took = await claimNotification({
      userId: mark.userId,
      type: 'training.session.absent',
      key,
      sessionId,
    })
    if (!took) continue

    await notify(event, {
      type: 'training.session.absent',
      userId: mark.userId,
      claim: key,
      context: {
        name: '',
        heldOn: saysDayLong(heldOn),
        taught: saysTaught(modules),
        trainingUrl: `${useRuntimeConfig(event).public.baseURL}/training`,
      },
    })
    told++
  }
  return told
}

const saysTaught = (modules: { name: string }[]): string => modules.map(module => module.name).join(', ')

// A correction moves somebody's record one way or the other, and each direction says which. Keyed
// to the correction, so being dropped, added back and dropped again each tells them (0241).
export async function tellCorrected(
  event: H3Event | undefined,
  sessionId: string,
  heldOn: string,
  modules: { name: string }[],
  correction: Correction,
): Promise<void> {
  const moves = [
    ...correction.dropped.map(userId => ({ userId, type: 'training.session.withdrawn' as const })),
    ...correction.added.map(userId => ({ userId, type: 'training.session.added' as const })),
  ]
  for (const move of moves) {
    const key = `${move.type}:${sessionId}:${move.userId}:${correction.at}`
    if (!(await claimNotification({ userId: move.userId, type: move.type, key, sessionId }))) continue
    await notify(event, {
      type: move.type,
      userId: move.userId,
      claim: key,
      context: {
        name: '',
        heldOn: saysDayLong(heldOn),
        taught: saysTaught(modules),
        trainingUrl: `${useRuntimeConfig(event).public.baseURL}/training`,
      },
    })
  }
}
