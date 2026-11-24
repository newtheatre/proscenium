// What the console's session screens read (K3, K4): each session's places and those waiting, what a
// new session is made from, and how many sessions are left to mark.
import { and, count, eq, or, like, sql } from 'drizzle-orm'
import { all, can, first, nowMs, useDb, useSetting, type Actor } from '#kit'
import { placeOf } from '#modules/core'
import { courses, sessions } from './db/schema'
import type { CourseRead } from './console'

/** One page of K3, with the title search the route was sent. Subqueries name the table: drizzle leaves it off. */
export async function sessionRows(read: CourseRead, q: string) {
  const words = q.trim().toLowerCase()
  const match = words ? or(like(sql`lower(${courses.title})`, `%${words}%`), like(sql`lower(${sessions.title})`, `%${words}%`)) : undefined
  const where = and(read.where(), match)
  const db = useDb()
  const rows = await db.select({
    id: sessions.id,
    courseId: sessions.courseId,
    courseTitle: courses.title,
    title: sessions.title,
    startsAt: sessions.startsAt,
    endsAt: sessions.endsAt,
    spaceName: sql<string | null>`(SELECT CASE WHEN sp.name = v.name THEN v.name ELSE sp.name || ', ' || v.name END FROM core_spaces sp JOIN core_venues v ON v.id = sp.venue_id WHERE sp.id = training_sessions.space_id)`,
    placeNote: sessions.placeNote,
    capacity: sessions.capacity,
    placesTaken: sessions.placesTaken,
    waiting: sql<number>`(SELECT count(*) FROM training_session_places p WHERE p.session_id = training_sessions.id AND p.state = 'waiting')`,
    status: sessions.status,
  }).from(sessions).innerJoin(courses, eq(courses.id, sessions.courseId)).where(where).orderBy(...read.orderBy(), sessions.id).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(sessions).innerJoin(courses, eq(courses.id, sessions.courseId)).where(where) as [{ n: number }]
  return { rows, total }
}

export interface SessionOptions { courses: { value: string, label: string }[], spaces: { value: string, label: string }[], capacity: number, create?: boolean }

/** What a new session is made from: live courses, the theatre's own spaces (external rooms go through the room manager) and the usual capacity. */
export async function sessionOptions(): Promise<SessionOptions> {
  const live = await all<{ value: string, label: string }>('SELECT id AS value, title AS label FROM training_courses WHERE status = \'live\' ORDER BY lower(title)')
  const spaces = await all<{ id: string, space: string, venue: string }>(
    'SELECT s.id, s.name AS space, v.name AS venue FROM core_spaces s JOIN core_venues v ON v.id = s.venue_id WHERE s.state = \'active\' AND s.managed = 1 ORDER BY lower(v.name), s.sort, lower(s.name)',
  )
  return { courses: live, spaces: spaces.map(s => ({ value: s.id, label: placeOf(s.space, s.venue) })), capacity: await useSetting('training.sessions.default-capacity') as number }
}

/** Published sessions over and not yet closed, for whoever manages sessions. */
export async function unmarkedSessions(actor: Actor): Promise<number> {
  if (!(await can(actor, 'training.session.manage')).allowed) return 0
  const row = await first<{ n: number }>('SELECT count(*) AS n FROM training_sessions WHERE status = \'published\' AND ends_at <= ?', nowMs())
  return row?.n ?? 0
}
