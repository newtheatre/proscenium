// What the builder starts from: a saved report as stored, for its maker or a manager, or a
// ready-made one to save a copy of (K2).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { draftFrom, formOf } from '../../../../definitions'

export default defineRoute({ ability: 'reports.report.create', rateLimit: 'default' }, async (event, { actor }) => {
  const id = getRouterParam(event, 'id')!
  return id.startsWith('rpd_') ? formOf(id, actor) : draftFrom(id, actor)
})
