// Who a viewer may plan for (rule A7): the members of groups a contribution says they may plan for,
// or anyone at all for a holder of availability.find.anyone. A reason is shared only through a group.
import { sql, type SQL } from 'drizzle-orm'
import { can, refuse, useDb, usePoint, type Actor } from '#kit'
import type { AvailabilityGroup } from './points/group'

export type Who = { groupId: string } | { accountIds: string[] }

export const PEOPLE_MAX = 200 // not-policy: rule F1's ceiling on one read

async function groupKinds(): Promise<AvailabilityGroup[]> {
  return (await usePoint<AvailabilityGroup>('availability.group')).map(c => c.value)
}

export async function groupKind(groupId: string): Promise<AvailabilityGroup> {
  const kind = (await groupKinds()).find(g => groupId.startsWith(g.prefix))
  return kind ?? refuse('availability.group.unknown', 'There is no such group.', { status: 404 })
}

const ids = (sqlIds: SQL) => useDb().all<{ id: string }>(sql`SELECT DISTINCT id FROM (${sqlIds})`).then(r => r.map(x => x.id))

/** The groups a viewer may plan for, from every contribution. */
export async function plannedGroups(viewerId: string): Promise<{ id: string, label: string, hint?: string }[]> {
  const out = []
  for (const kind of await groupKinds()) out.push(...await kind.list(viewerId))
  return out
}

/** Of `accountIds`, those in a group the viewer plans for. One check per group, each a subquery. */
async function throughGroups(viewerId: string, accountIds: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  const asked = JSON.stringify(accountIds)
  for (const kind of await groupKinds()) {
    for (const g of await kind.list(viewerId)) {
      const rows = await useDb().all<{ id: string }>(sql`SELECT value AS id FROM json_each(${asked}) WHERE value IN (${kind.members(g.id)})`)
      rows.forEach(r => found.add(r.id))
      if (found.size === accountIds.length) return found
    }
  }
  return found
}

export interface Plannable {
  /** The people the viewer may read, in the order asked. */
  people: string[]
  /** People asked for whom the viewer may not plan: counted, never named. */
  hidden: number
  /** Whose shared reasons the viewer may read: their own, and people in a group they plan for. */
  reasons: Set<string>
}

/** Resolves a group or a list of people to those the viewer may plan for (A7, F1). */
export async function plannable(viewer: Actor, who: Who): Promise<Plannable> {
  const me = viewer.accountId ?? null
  if (!me) refuse('core.access.signed-out', 'You need to sign in.', { status: 401 })
  if ('groupId' in who) {
    const kind = await groupKind(who.groupId)
    const anyone = (await can(viewer, 'availability.find.anyone')).allowed
    const plans = await kind.canPlan(me, who.groupId)
    if (!plans && !anyone) refuse('availability.group.not-yours', 'You do not plan for this group.', { status: 403 })
    const people = await ids(kind.members(who.groupId))
    if (people.length > PEOPLE_MAX) refuse('availability.too-many', `At most ${PEOPLE_MAX} people at once.`, { status: 422 })
    return { people, hidden: 0, reasons: new Set(plans ? people : people.filter(p => p === me)) }
  }
  const asked = [...new Set(who.accountIds)]
  if (asked.length > PEOPLE_MAX) refuse('availability.too-many', `At most ${PEOPLE_MAX} people at once.`, { status: 422 })
  const others = asked.filter(a => a !== me)
  const viaGroup = others.length ? await throughGroups(me, others) : new Set<string>()
  const anyone = others.length > viaGroup.size && (await can(viewer, 'availability.find.anyone')).allowed
  const people = asked.filter(a => a === me || viaGroup.has(a) || anyone)
  return { people, hidden: asked.length - people.length, reasons: new Set([...viaGroup, ...(me && asked.includes(me) ? [me] : [])]) }
}
