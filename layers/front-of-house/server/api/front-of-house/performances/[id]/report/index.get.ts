// The night report for a performance: a live view while a draft, the snapshot once signed off, with
// notes and addenda (FH-31 to FH-33). For those who read reports and for those who write them.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { readReport } from '../../../../../reports'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (event, { actor }) => {
  const id = getRouterParam(event, 'id')!
  const record = ['core.performance', id] as const
  if (!(await can(actor, 'front-of-house.night-report.view', record)).allowed && !(await can(actor, 'front-of-house.night-report.write', record)).allowed)
    refuse('core.access.denied', 'You do not have permission to do this.', { status: 403 })
  return readReport(id)
})
