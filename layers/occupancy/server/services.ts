// The occupancy service (OC-01, rules O1 to O4). Any module that requires occupancy imports it as
// #modules/occupancy. It is a read for showing: no write anywhere is decided by it (O4).
import { sql } from 'drizzle-orm'
import { can, isEnabled, refuse, useDb, usePoint, type Actor } from '#kit'
import { dayRule, operatingDayAt, type SpaceBusy } from '#modules/core'
import { OCCUPANCY_MAX_DAYS, OCCUPANCY_MAX_SPACES, type OccupancyItem, type SpaceOccupancy } from '../shared/occupancy'

export type { OccupancyItem, SpaceOccupancy } from '../shared/occupancy'

const DAY_MS = 86_400_000 // not-policy: a day in milliseconds

export interface OccupancyQuery {
  spaceIds: string[]
  /** [from, to) in UTC milliseconds. */
  from: number
  to: number
}

/**
 * Everything taking each space in the window (O1): scheduled and draft performances, closures and
 * public holidays from core, and every core.space-busy contribution. `actor` decides the labels
 * (O2); null, for a job, asks for none.
 */
export async function occupancy(query: OccupancyQuery, actor: Actor | null): Promise<SpaceOccupancy[]> {
  if (!(await isEnabled('occupancy'))) refuse('core.module.off', 'occupancy is off: no module that needs it is switched on.', { status: 404 })
  const spaceIds = [...new Set(query.spaceIds)]
  if (!(query.to > query.from)) refuse('occupancy.window', 'The window must end after it starts.', { status: 422, fields: { to: 'The window must end after it starts.' } })
  if (query.to - query.from > OCCUPANCY_MAX_DAYS * DAY_MS) refuse('occupancy.too-long', `Ask for at most ${OCCUPANCY_MAX_DAYS} days at a time.`, { status: 422, fields: { to: `At most ${OCCUPANCY_MAX_DAYS} days.` } })
  if (spaceIds.length > OCCUPANCY_MAX_SPACES) refuse('occupancy.too-many-spaces', `Ask for at most ${OCCUPANCY_MAX_SPACES} spaces at a time.`, { status: 422, fields: { spaceIds: `At most ${OCCUPANCY_MAX_SPACES} spaces.` } })
  if (!spaceIds.length) return []
  const rule = await dayRule() ?? refuse('core.locale.time-zone-unset', 'The theatre\'s time zone has not been set yet.', { status: 409 })
  const days = (from: number, to: number) => ({ day: operatingDayAt(from, rule), lastDay: operatingDayAt(Math.max(from, to - 1), rule) })
  const ids = JSON.stringify(spaceIds)
  const db = useDb()

  const performances = await db.all<{ id: string, space_id: string, starts_at: number, ends_at: number, state: string, production_id: string, title: string }>(sql`
    SELECT p.id, p.space_id, p.starts_at, p.ends_at, p.state, p.production_id, pr.title
    FROM core_performances p JOIN core_productions pr ON pr.id = p.production_id
    WHERE p.space_id IN (SELECT value FROM json_each(${ids})) AND p.state IN ('scheduled', 'draft')
      AND p.starts_at < ${query.to} AND p.ends_at > ${query.from}`)
  // A closure reaches a space when it is the whole theatre's, its venue's, or the space's own.
  const closures = await db.all<{ id: string, space_id: string, kind: string, title: string, starts_at: number, ends_at: number, blocks_performances: number }>(sql`
    SELECT c.id, s.id AS space_id, c.kind, c.title, c.starts_at, c.ends_at, c.blocks_performances
    FROM core_closures c JOIN core_spaces s ON s.id IN (SELECT value FROM json_each(${ids}))
    WHERE c.starts_at < ${query.to} AND c.ends_at > ${query.from}
      AND (c.venue_id IS NULL OR (c.space_id IS NULL AND c.venue_id = s.venue_id) OR c.space_id = s.id)`)

  const viewable = new Map<string, boolean>()
  const mayView = async (productionId: string) => {
    if (!actor) return false
    if (!viewable.has(productionId)) viewable.set(productionId, (await can(actor, 'core.production.view', ['core.production', productionId])).allowed)
    return viewable.get(productionId)!
  }

  const items: (OccupancyItem & { spaceId: string })[] = []
  for (const p of performances) {
    items.push({
      spaceId: p.space_id, kind: p.state === 'scheduled' ? 'performance-scheduled' : 'performance-draft', module: 'core',
      from: p.starts_at, to: p.ends_at, ...days(p.starts_at, p.ends_at), yields: false,
      record: { type: 'core.performance', id: p.id }, label: await mayView(p.production_id) ? p.title : null,
    })
  }
  for (const c of closures) {
    // A closure's title says why the building is shut ("Christmas"), never about a person, so it is shown to every reader.
    items.push({
      spaceId: c.space_id, kind: c.kind === 'public_holiday' ? 'public-holiday' : 'closure', module: 'core',
      from: c.starts_at, to: c.ends_at, ...days(c.starts_at, c.ends_at), yields: !c.blocks_performances,
      record: { type: 'core.closure', id: c.id }, label: c.title,
    })
  }
  const wanted = new Set(spaceIds)
  for (const { module, value } of await usePoint<SpaceBusy>('core.space-busy')) {
    for (const b of await value.busy({ spaceIds, from: query.from, to: query.to }, actor)) {
      if (!wanted.has(b.spaceId) || !(b.from < query.to && b.to > query.from)) continue
      items.push({ spaceId: b.spaceId, kind: b.kind, module, from: b.from, to: b.to, ...days(b.from, b.to), yields: b.yields, record: b.record, label: b.label })
    }
  }

  return spaceIds.map(spaceId => ({
    spaceId,
    items: items.filter(i => i.spaceId === spaceId)
      .sort((a, b) => a.from - b.from || a.to - b.to || a.record.id.localeCompare(b.record.id))
      .map(({ spaceId: _, ...item }) => item),
  }))
}
