// One performance's rota, for whoever runs it (Front of house specification, part 5, "Performance
// rota"): each shift with its people and their states, and the templates that could be applied.
import { getRouterParam } from 'h3'
import { all, defineRoute, first } from '#kit'
import { accountLabel } from '#modules/core'
import { shiftsOf } from '../../../../shifts'
import { listTemplates } from '../../../../templates'

export default defineRoute({
  ability: 'front-of-house.shift.view',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const shifts = await shiftsOf(record!.id!)
  const people = shifts.length
    ? await all<{ id: string, shift_id: string, account_id: string, state: string }>(
        `SELECT id, shift_id, account_id, state FROM front_of_house_assignments
          WHERE shift_id IN (SELECT value FROM json_each(?)) AND state NOT IN ('declined', 'withdrawn') ORDER BY created_at`, JSON.stringify(shifts.map(s => s.id)))
    : []
  const names = new Map<string, string>()
  for (const p of people) if (!names.has(p.account_id)) names.set(p.account_id, await accountLabel(p.account_id))
  const performance = await first<{ title: string, starts_at: number, venue: string | null }>(
    `SELECT p.title, f.starts_at, v.name AS venue FROM core_performances f JOIN core_productions p ON p.id = f.production_id
       LEFT JOIN core_venues v ON v.id = f.venue_id WHERE f.id = ?`, record!.id!)
  return {
    performance: performance ? { title: performance.title, startsAt: performance.starts_at, venue: performance.venue } : null,
    shifts: shifts.map(s => ({
      ...s,
      people: people.filter(p => p.shift_id === s.id).map(p => ({ assignmentId: p.id, accountId: p.account_id, name: names.get(p.account_id)!, state: p.state })),
    })),
    templates: (await listTemplates()).map(t => ({ id: t.id, name: t.name, venueId: t.venueId, isDefault: t.isDefault })),
  }
})
