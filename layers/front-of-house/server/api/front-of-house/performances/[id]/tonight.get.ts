// The front of house section of Tonight for one performance (FH-19, FH-20), with what this viewer
// may do on it, their own place if they have one, and the count of open incidents for those who
// may see incidents.
import { getRouterParam } from 'h3'
import { can, defineRoute, first } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { board } from '../../../../night'

export default defineRoute({
  ability: 'front-of-house.shift.view',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const id = record!.id!
  const on = ['core.performance', id] as const
  const allowed = async (ability: string) => (await can(actor, ability as never, on)).allowed
  const answer = await board(id, actor)
  const mine = await first<{ id: string }>(
    `SELECT a.id FROM front_of_house_assignments a JOIN front_of_house_shifts s ON s.id = a.shift_id
      WHERE s.performance_id = ?1 AND a.account_id IN (${accountScopeSql('?2')}) AND a.state IN ('confirmed', 'release_requested', 'checked_in') -- not-policy: numbered parameters
      ORDER BY s.call_at LIMIT 1`, id, actor.accountId ?? '')
  const seesIncidents = (await can(actor, 'front-of-house.incident.view')).allowed
  const open = seesIncidents
    ? await first<{ n: number }>('SELECT count(*) AS n FROM front_of_house_incidents WHERE performance_id = ? AND state <> \'closed\'', id)
    : null
  return {
    ...answer,
    mine: mine?.id ?? null,
    openIncidents: open ? open.n : null,
    can: {
      lead: await allowed('front-of-house.assignment.check-in'),
      checklists: await allowed('front-of-house.checklist.complete'),
      report: await allowed('front-of-house.night-report.write') || await allowed('front-of-house.night-report.sign-off'),
      incident: (await can(actor, 'front-of-house.incident.report')).allowed,
      emergency: (await can(actor, 'front-of-house.emergency-card.view')).allowed,
    },
  }
})
