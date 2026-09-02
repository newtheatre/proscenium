import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { expiryFor } from '#shared/utils/training'
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
  expiryMode: string
  expiryMonths: number | null
}

export async function modulesTaughtBy(sessionId: string): Promise<TaughtModule[]> {
  return db.select({
    id: schema.trainingModules.id,
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

interface MarkRun {
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

function chunk<T>(items: T[], size: number): T[][] {
  const parts: T[][] = []
  for (let index = 0; index < items.length; index += size) parts.push(items.slice(index, index + size))
  return parts
}

// Criterion 3's other half. Somebody marked absent hears why nothing landed on their record, and
// the copy makes clear nothing has been held against them.
export async function tellAbsentees(
  event: H3Event | undefined,
  sessionId: string,
  heldOn: string,
  marks: { userId: string, mark: AttendanceMark }[],
): Promise<number> {
  let told = 0
  for (const mark of marks) {
    if (mark.mark !== 'ABSENT') continue
    const took = await claimNotification({
      userId: mark.userId,
      type: 'training.session.absent',
      key: `training.session.absent:${sessionId}:${mark.userId}`,
      sessionId,
    })
    if (!took) continue

    await notify(event, {
      type: 'training.session.absent',
      userId: mark.userId,
      context: {
        name: '',
        heldOn,
        trainingUrl: `${useRuntimeConfig(event).public.baseURL}/training`,
      },
    })
    told++
  }
  return told
}
