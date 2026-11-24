// What the console's competency screen reads (K8): each competency's courses, routes and holders now,
// and what a route may be built from.
import { and, count, like, sql } from 'drizzle-orm'
import { all, requirements, useDb, usePoint } from '#kit'
import { holderCount } from './competencies'
import { competencies } from './db/schema'
import type { CourseRead } from './console'

/** One page of K8, with the title search the route was sent. Subqueries name the table: drizzle leaves it off. */
export async function competencyRows(read: CourseRead, q: string) {
  const words = q.trim().toLowerCase()
  const where = and(read.where(), words ? like(sql`lower(${competencies.title})`, `%${words}%`) : undefined)
  const db = useDb()
  const rows = await db.select({
    id: competencies.id,
    title: competencies.title,
    status: competencies.status,
    routes: sql<number>`(SELECT count(*) FROM training_competency_routes r WHERE r.competency_id = training_competencies.id AND r.status = 'active')`,
  }).from(competencies).where(where).orderBy(...read.orderBy()).limit(read.limit).offset(read.offset)
  const [{ n: total }] = await db.select({ n: count() }).from(competencies).where(where) as [{ n: number }]
  const out = []
  for (const row of rows) out.push({ ...row, courses: await coursesOf(row.id), holders: await holderCount(row.id) })
  return { rows: out, total }
}

async function coursesOf(competencyId: string): Promise<string[]> {
  const found = await all<{ title: string }>(
    `SELECT c.title, min(r.position * 100 + i.position) AS at FROM training_route_items i /* not-policy: orders items within routes */
       JOIN training_competency_routes r ON r.id = i.route_id JOIN training_courses c ON c.id = i.course_id
      WHERE r.competency_id = ? AND r.status = 'active' GROUP BY c.id ORDER BY at`,
    competencyId,
  )
  return found.map(c => c.title)
}

export interface RouteOptions { courses: { value: string, label: string }[], recognised: { value: string, label: string }[] }

/** Courses not retired, and what the switched-on modules recognise, never Training's own (a route cannot name another competency). */
export async function routeOptions(): Promise<RouteOptions> {
  const courses = await all<{ value: string, label: string }>('SELECT id AS value, title AS label FROM training_courses WHERE status != \'retired\' ORDER BY lower(title)')
  const sources = (await usePoint('core.requirement')).map(c => c.id).filter(id => id !== 'training')
  const offered = (await Promise.all(sources.map(id => requirements.options(id, '')))).flat()
  const recognised = offered.filter(o => !o.reference.startsWith('fact:training.')).map(o => ({ value: o.reference, label: o.label }))
  return { courses, recognised }
}
