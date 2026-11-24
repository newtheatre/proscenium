// What Find a time offers (S7): the groups the viewer plans for, the rooms, the grid's step and hours,
// and whether the viewer may arrange a meeting (the screen never tests an ability itself).
import { can, defineRoute, theatreTimeZone, useSetting } from '#kit'
import { localDateOf, nowMs } from '#kit/clock'
import { listVenues } from '#modules/core'
import { plannedGroups } from '../../../planning'

export default defineRoute({ ability: 'availability.find.use', rateLimit: 'default' }, async (_event, { actor }) => ({
  today: localDateOf(nowMs(), await theatreTimeZone()),
  grid: { step: Number(await useSetting('availability.grid.step')), dayStarts: await useSetting('availability.grid.day-starts') as string, dayEnds: await useSetting('availability.grid.day-ends') as string },
  groups: await plannedGroups(actor.accountId!),
  arrange: (await can(actor, 'availability.meeting.arrange')).allowed,
  venues: (await listVenues()).map(v => ({ id: v.id, name: v.name, spaces: v.spaces.filter(s => !s.archived).map(s => ({ id: s.id, name: s.name })) })).filter(v => v.spaces.length),
}))
