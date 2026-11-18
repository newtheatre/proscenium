// The night report for a performance: a live view while a draft, the snapshot once signed off, with
// notes and addenda (FH-31 to FH-33). For those who read reports and for those who write them, and,
// once signed off, for whoever signed it or led that night.
import { getRouterParam } from 'h3'
import { can, defineRoute, first, refuse } from '#kit'
import { accountLabel } from '#modules/core'
import { readReport, readsSignedReport } from '../../../../../reports'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
}, async (event, { actor }) => {
  const id = getRouterParam(event, 'id')!
  const record = ['core.performance', id] as const
  if (!(await can(actor, 'front-of-house.night-report.view', record)).allowed && !(await can(actor, 'front-of-house.night-report.write', record)).allowed
    && !(actor.accountId && await readsSignedReport(id, actor.accountId)))
    refuse('core.access.denied', 'You do not have permission to do this.', { status: 403 })
  const report = await readReport(id)
  // The names its ids point at, the performance it is for, and what the viewer may do with it.
  const ids = new Set([report.signedOffBy, ...report.notes.map(n => n.authorId), ...(report.unresolved?.people.map(p => p.accountId) ?? [])].filter((x): x is string => !!x))
  const names: Record<string, string> = {}
  for (const accountId of ids) names[accountId] = await accountLabel(accountId)
  const performance = await first<{ title: string, starts_at: number }>(
    'SELECT p.title, f.starts_at FROM core_performances f JOIN core_productions p ON p.id = f.production_id WHERE f.id = ?', id)
  return {
    ...report,
    names,
    performance: performance ? { title: performance.title, startsAt: performance.starts_at } : null,
    can: {
      write: (await can(actor, 'front-of-house.night-report.write', record)).allowed,
      signOff: (await can(actor, 'front-of-house.night-report.sign-off', record)).allowed,
    },
  }
})
