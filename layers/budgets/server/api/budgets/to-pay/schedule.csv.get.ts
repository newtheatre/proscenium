// The parent body's schedule (BC-32): approved claims it pays that are still owed, one row per item.
import { setResponseHeader } from 'h3'
import { defineRoute, localDate, nowMs } from '#kit'
import { parentBodySchedule } from '../../../paying'

export default defineRoute({ ability: 'budgets.claim.pay', rateLimit: 'export' }, async (event, { actor, unit }) => {
  const { csv, claims } = await parentBodySchedule(actor)
  unit.audit({ action: 'read', ability: 'budgets.claim.pay', detail: { parentBodySchedule: claims } })
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="claims-for-the-parent-body-${await localDate(nowMs())}.csv"`)
  return csv
})
