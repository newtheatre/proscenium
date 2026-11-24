// The competencies: active ones for anyone who may see courses, retired ones too for those who manage them.
import { can, defineRoute } from '#kit'
import { listCompetencies } from '../../../competencies'

export default defineRoute({
  ability: 'training.course.view',
  rateLimit: 'default',
}, async (_event, { actor }) => {
  const manages = (await can(actor, 'training.competency.manage')).allowed
  return { competencies: await listCompetencies({ retired: manages }), actions: { manage: manages } }
})
