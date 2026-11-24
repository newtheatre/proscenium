// What the console's course screens read (K1, K2): holders now, those lapsing within the warning, the
// live version and whether one is in preparation, and a course's next session.
import { and, count, like, sql, type SQL } from 'drizzle-orm'
import { first, nowMs, useDb, useSetting } from '#kit'
import { courses } from './db/schema'

const SECOND = 1000 // not-policy: settings are whole seconds

/** Awarded records still in force at `at`, as a condition on training_records aliased `r`. */
const inForce = (at: number) => sql`r.status = 'awarded' AND (r.expires_at IS NULL OR r.expires_at >= ${at})`

async function warnUntil(at: number): Promise<number> {
  return at + (await useSetting('training.records.warn-before') as number) * SECOND
}

export interface CourseRead { where: () => SQL | undefined, orderBy: () => SQL[], limit: number, offset: number }

/** One page of K1, with the title search the route was sent. Subqueries name the table: drizzle leaves it off. */
export async function courseRows(read: CourseRead, q: string) {
  const at = nowMs()
  const until = await warnUntil(at)
  const words = q.trim().toLowerCase()
  const where = and(read.where(), words ? like(sql`lower(${courses.title})`, `%${words}%`) : undefined)
  const db = useDb()
  const rows = await db.select({
    id: courses.id,
    title: courses.title,
    status: courses.status,
    version: sql<number | null>`(SELECT number FROM training_course_versions v WHERE v.id = training_courses.live_version_id)`,
    preparing: sql<number>`EXISTS (SELECT 1 FROM training_course_versions v WHERE v.course_id = training_courses.id AND v.status = 'in-preparation')`,
    current: sql<number>`(SELECT count(DISTINCT r.account_id) FROM training_records r WHERE r.course_id = training_courses.id AND ${inForce(at)})`,
    lapsing: sql<number>`(SELECT count(DISTINCT r.account_id) FROM training_records r WHERE r.course_id = training_courses.id AND ${inForce(at)} AND r.expires_at <= ${until})`,
  }).from(courses).where(where).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(courses).where(where) as [{ n: number }]
  return { rows: rows.map(r => ({ ...r, preparing: !!r.preparing })), total }
}

export interface CourseOverview { holders: number, lapsing: number, nextSession: { id: string, startsAt: number } | null }

/** The figures over K2's tabs. */
export async function courseOverview(courseId: string): Promise<CourseOverview> {
  const at = nowMs()
  const until = await warnUntil(at)
  const held = await first<{ holders: number, lapsing: number }>(
    `SELECT count(DISTINCT r.account_id) AS holders, count(DISTINCT CASE WHEN r.expires_at <= ?3 THEN r.account_id END) AS lapsing /* not-policy: bound parameters */
       FROM training_records r WHERE r.course_id = ?1 AND r.status = 'awarded' AND (r.expires_at IS NULL OR r.expires_at >= ?2)`,
    courseId, at, until,
  )
  const next = await first<{ id: string, startsAt: number }>(
    'SELECT id, starts_at AS startsAt FROM training_sessions WHERE course_id = ?1 AND starts_at >= ?2 AND status IN (\'unpublished\', \'published\') ORDER BY starts_at LIMIT 1',
    courseId, at,
  )
  return { holders: held?.holders ?? 0, lapsing: held?.lapsing ?? 0, nextSession: next ?? null }
}
