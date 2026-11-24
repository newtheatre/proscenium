// One competency with its routes in order; for those who manage it, how many hold it now (R9).
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { competencyOrRefuse, holderCount, routesOf } from '../../../../competencies'

export default defineRoute({
  ability: 'training.course.view',
  record: event => ['training.competency', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record, actor }) => {
  const competency = await competencyOrRefuse(record!.id)
  const manages = (await can(actor, 'training.competency.manage', record)).allowed
  if (competency.status === 'retired' && !manages) refuse('training.competency.not-found', 'There is no such competency.', { status: 404 })
  const routes = await routesOf(competency.id)
  return {
    competency,
    routes: manages ? routes : routes.filter(r => r.status === 'active'),
    holders: manages ? await holderCount(competency.id) : null,
    actions: { manage: manages },
  }
})
