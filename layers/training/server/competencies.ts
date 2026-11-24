// Competencies and their routes (amended part 3, R1, R7, R9; TR-22, TR-35). A competency is made of
// routes, each of one or more items; changing them changes who holds it from the next read, so
// every change is audited and the screen shows how many hold it before and after.
import { all, first, newId, nowMs, refuse, requirements, type UnitView } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { holdersOfCompetency, verdicts } from './verdicts'

export interface Competency { id: string, title: string, slug: string, description: string | null, status: 'active' | 'retired', createdAt: number, updatedAt: number }
export interface RouteItemInput { kind: 'course', courseId: string }
export interface RecognisedItemInput { kind: 'recognised', requirementRef: string }
export interface RouteInput { id?: string, label: string, status: 'active' | 'retired', items: (RouteItemInput | RecognisedItemInput)[] }
export interface Route { id: string, label: string, position: number, status: 'active' | 'retired', items: ({ kind: 'course', courseId: string, courseTitle: string } | { kind: 'recognised', requirementRef: string, label: string | null })[] }

const COMPETENCY = 'SELECT id, title, slug, description, status, created_at AS createdAt, updated_at AS updatedAt FROM training_competencies'

export async function getCompetency(id: string): Promise<Competency | null> {
  return first<Competency>(`${COMPETENCY} WHERE id = ?`, id)
}

export async function competencyOrRefuse(id: string): Promise<Competency> {
  return await getCompetency(id) ?? refuse('training.competency.not-found', 'There is no such competency.', { status: 404 })
}

export async function listCompetencies(options: { retired: boolean }): Promise<Competency[]> {
  return all<Competency>(`${COMPETENCY} ${options.retired ? '' : 'WHERE status = \'active\''} ORDER BY status, lower(title)`)
}

/** A competency's routes in order, with each item labelled; a recognised item whose source has gone reads as no longer available. */
export async function routesOf(competencyId: string): Promise<Route[]> {
  const routes = await all<{ id: string, label: string, position: number, status: 'active' | 'retired' }>('SELECT id, label, position, status FROM training_competency_routes WHERE competency_id = ? ORDER BY position', competencyId)
  const items = await all<{ routeId: string, kind: 'course' | 'recognised', courseId: string | null, courseTitle: string | null, ref: string | null }>(
    `SELECT i.route_id AS routeId, i.kind, i.course_id AS courseId, c.title AS courseTitle, i.requirement_ref AS ref FROM training_route_items i
       JOIN training_competency_routes r ON r.id = i.route_id LEFT JOIN training_courses c ON c.id = i.course_id
      WHERE r.competency_id = ? ORDER BY i.route_id, i.position`,
    competencyId,
  )
  const refs = [...new Set(items.filter(i => i.ref).map(i => i.ref!))]
  const described = refs.length ? await requirements.describe(refs) : {}
  return routes.map(route => ({
    ...route,
    items: items.filter(i => i.routeId === route.id).map(i => i.kind === 'course'
      ? { kind: 'course' as const, courseId: i.courseId!, courseTitle: i.courseTitle! }
      : { kind: 'recognised' as const, requirementRef: i.ref!, label: described[i.ref!]?.label ?? null }),
  }))
}

function slugOf(title: string): string {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'competency' // not-policy: a slug's shape
}

async function freeSlug(title: string, except?: string): Promise<string> {
  const base = slugOf(title)
  const taken = new Set((await all<{ slug: string }>('SELECT slug FROM training_competencies WHERE (slug = ?1 OR slug LIKE ?1 || \'-%\') AND id IS NOT ?2', base, except ?? null)).map(r => r.slug))
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  return slug
}

/** A new competency, not active until it has a route with an item (R1). */
export async function createCompetency(unit: UnitView, input: { title: string, description?: string | null }): Promise<string> {
  const id = newId('tcmp')
  const at = nowMs()
  unit.add({
    sql: 'INSERT INTO training_competencies (id, title, slug, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, \'retired\', ?, ?)',
    params: [id, input.title, await freeSlug(input.title), input.description ?? null, at, at],
  })
  unit.audit({ action: 'create', record: ['training.competency', id] })
  return id
}

export async function updateCompetency(unit: UnitView, id: string, input: { title?: string, description?: string | null }): Promise<void> {
  const before = await competencyOrRefuse(id)
  const title = input.title ?? before.title
  unit.add({
    sql: 'UPDATE training_competencies SET title = ?, slug = ?, description = ?, updated_at = ? WHERE id = ?',
    params: [title, title === before.title ? before.slug : await freeSlug(title, id), input.description === undefined ? before.description : input.description, nowMs(), id],
  }).expect(1)
  unit.audit({ action: 'update', record: ['training.competency', id], detail: { fields: Object.keys(input) } })
}

/** Refuses a recognised item that names Training itself or a reference the kit cannot read (R7). */
function checkRef(ref: string): void {
  if (/^training:/.test(ref) || /^fact:training\./.test(ref))
    refuse('training.route.self-reference', 'A route cannot name Training\'s own competencies or facts.', { status: 422, remedy: 'List the same courses in this competency instead.' })
  if (!/^[a-z][a-z0-9.-]*:\S+$/.test(ref)) refuse('training.route.bad-reference', 'That is not a requirement another module can check.', { status: 422 }) // not-policy: the shape of a reference
}

/** Whether a set of routes lets anyone hold the competency: an active route with an item (R1). */
const holdable = (routes: { status: string, items: unknown[] }[]) => routes.some(r => r.status === 'active' && r.items.length > 0)

/**
 * Replaces a competency's routes and their items in order (R9). Routes keep their ids where given;
 * a route left out of the list is retired, never deleted, so history still reads. Refused when it
 * would leave an active competency with nothing to hold it by (R1).
 */
export async function saveRoutes(unit: UnitView, competencyId: string, input: RouteInput[]): Promise<void> {
  const competency = await competencyOrRefuse(competencyId)
  for (const route of input) for (const item of route.items) if (item.kind === 'recognised') checkRef(item.requirementRef)
  if (competency.status === 'active' && !holdable(input))
    refuse('training.competency.no-route', 'An active competency needs at least one active route with something in it.', { status: 422, remedy: 'Add a route, or retire the competency first.' })
  const courseIds = [...new Set(input.flatMap(r => r.items.flatMap(i => i.kind === 'course' ? [i.courseId] : [])))]
  if (courseIds.length) {
    const found = await all<{ id: string }>('SELECT id FROM training_courses WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(courseIds))
    if (found.length !== courseIds.length) refuse('training.course.not-found', 'A route names a course that does not exist.', { status: 422 })
  }
  const before = await routesOf(competencyId)
  const known = new Set(before.map(r => r.id))
  for (const route of input) if (route.id && !known.has(route.id)) refuse('training.route.not-found', 'A route was changed by someone else while you were editing.', { status: 409, remedy: 'Reload and try again.' })
  const kept = new Set(input.filter(r => r.id).map(r => r.id!))
  const at = nowMs()
  const rows = [
    ...input.map((route, i) => ({ id: route.id ?? newId('trte'), label: route.label, status: route.status, position: i + 1, items: route.items })),
    // Routes left out are retired and moved after the rest, keeping their rows.
    ...before.filter(r => !kept.has(r.id)).map((r, i) => ({ id: r.id, label: r.label, status: 'retired' as const, position: input.length + i + 1, items: null })),
  ]
  // Positions are unique, so they are moved clear first, then set (T4: one statement each).
  unit.add({ sql: 'UPDATE training_competency_routes SET position = position + 1000 WHERE competency_id = ?', params: [competencyId] }) // not-policy: clears the unique positions while they are renumbered
  unit.add({
    sql: `INSERT INTO training_competency_routes (id, competency_id, position, label, status, created_at, updated_at)
      SELECT j.value ->> 'id', ?1, j.value ->> 'position', j.value ->> 'label', j.value ->> 'status', ?2, ?2 FROM json_each(?3) j WHERE true /* not-policy: bound parameters */
      ON CONFLICT (id) DO UPDATE SET position = excluded.position, label = excluded.label, status = excluded.status, updated_at = excluded.updated_at`,
    params: [competencyId, at, JSON.stringify(rows.map(({ items: _items, ...r }) => r))],
  })
  const given = rows.filter(r => r.items !== null)
  unit.add({ sql: 'DELETE FROM training_route_items WHERE route_id IN (SELECT value FROM json_each(?))', params: [JSON.stringify(given.map(r => r.id))] })
  const items = given.flatMap(r => r.items!.map((item, i) => ({ routeId: r.id, position: i + 1, kind: item.kind, courseId: item.kind === 'course' ? item.courseId : null, ref: item.kind === 'recognised' ? item.requirementRef : null })))
  if (items.length) {
    unit.add({
      sql: `INSERT INTO training_route_items (route_id, position, kind, course_id, requirement_ref, created_at)
        SELECT j.value ->> 'routeId', j.value ->> 'position', j.value ->> 'kind', j.value ->> 'courseId', j.value ->> 'ref', ? FROM json_each(?) j`,
      params: [at, JSON.stringify(items)],
    }).expect(items.length)
  }
  unit.add({ sql: 'UPDATE training_competencies SET updated_at = ? WHERE id = ?', params: [at, competencyId] })
  unit.announce('training.competency.routes-changed', { competencyId }, { record: ['training.competency', competencyId] })
  unit.audit({ action: 'update', record: ['training.competency', competencyId], detail: { routes: input.length, items: items.length } })
}

/** Makes a competency active, once it has a route to hold it by (R1), or retires it. */
export async function setCompetencyStatus(unit: UnitView, competencyId: string, status: 'active' | 'retired'): Promise<void> {
  if (status === 'active' && !holdable(await routesOf(competencyId)))
    refuse('training.competency.no-route', 'Add an active route with something in it before making the competency active.', { status: 422 })
  unit.add({ sql: 'UPDATE training_competencies SET status = ?, updated_at = ? WHERE id = ? AND status != ?', params: [status, nowMs(), competencyId, status] })
    .expect(1, { code: 'training.competency.unchanged', reason: status === 'active' ? 'This competency is already active.' : 'This competency is already retired.' })
  unit.audit({ action: 'state', record: ['training.competency', competencyId], detail: { status } })
}

/** How many hold the competency now, for the screen to show beside a change (C5, R9). */
export async function holderCount(competencyId: string): Promise<number> {
  return (await holdersOfCompetency(competencyId)).length
}

export interface Way { id: string, label: string, held: boolean, items: ({ kind: 'course', courseId: string, title: string, held: boolean, until: number | null } | { kind: 'recognised', label: string | null, held: boolean, until: number | null })[] }

/**
 * The learner's page for one competency (M13, TR-50): whether they hold it, and each active route
 * in order with their progress per item. Course items read their records; recognised items ask the kit.
 */
export async function waysFor(accountId: string, competencyId: string, at = nowMs()): Promise<{ held: boolean, until: number | null, heldBy: string | null, routes: Way[] }> {
  const [verdict] = await verdicts([accountId], [competencyId], at)
  const routes = (await routesOf(competencyId)).filter(r => r.status === 'active' && r.items.length)
  const courseIds = [...new Set(routes.flatMap(r => r.items.flatMap(i => i.kind === 'course' ? [i.courseId] : [])))]
  const records = courseIds.length
    ? await all<{ courseId: string, until: number | null }>(
        `SELECT course_id AS courseId, expires_at AS until FROM training_records WHERE account_id IN (${accountScopeSql('?1')})
          AND course_id IN (SELECT value FROM json_each(?2)) AND status != 'revoked'
          AND awarded_at <= ?3 AND (ended_at IS NULL OR ended_at > ?3) AND (expires_at IS NULL OR expires_at >= ?3) /* not-policy: bound parameters */`,
        accountId, JSON.stringify(courseIds), at)
    : []
  const courseHeld = new Map<string, number | null>()
  for (const r of records) {
    const before = courseHeld.get(r.courseId)
    courseHeld.set(r.courseId, before === null || r.until === null ? null : Math.max(before ?? 0, r.until))
  }
  const refs = [...new Set(routes.flatMap(r => r.items.flatMap(i => i.kind === 'recognised' ? [i.requirementRef] : [])))]
  const answers = refs.length ? await requirements.check({ accounts: [accountId], refs, at, whenUnavailable: 'not-met' }) : []
  const recognised = new Map(answers.map(a => [a.ref, { held: a.verdict === 'met' && !a.unavailable, until: a.until ?? null }]))
  const ways = routes.map((route) => {
    const items = route.items.map(i => i.kind === 'course'
      ? { kind: 'course' as const, courseId: i.courseId, title: i.courseTitle, held: courseHeld.has(i.courseId), until: courseHeld.get(i.courseId) ?? null }
      : { kind: 'recognised' as const, label: i.label, ...(recognised.get(i.requirementRef) ?? { held: false, until: null }) })
    return { id: route.id, label: route.label, held: items.every(i => i.held), items }
  })
  return { held: !!verdict?.met, until: verdict?.until ?? null, heldBy: verdict?.heldBy ?? null, routes: ways }
}

export async function competencyBySlug(slug: string): Promise<Competency | null> {
  return first<Competency>(`${COMPETENCY} WHERE slug = ?`, slug)
}
