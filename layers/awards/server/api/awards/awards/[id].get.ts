// One award, with what the viewer may do to it.
import { getRouterParam } from 'h3'
import { can, defineRoute, first } from '#kit'
import { requireAward } from '../../../awards'

export default defineRoute({ ability: 'awards.award.view', record: event => ['awards.award', getRouterParam(event, 'id')], rateLimit: 'default' }, async (_event, { actor, record }) => {
  const award = await requireAward(record!.id)
  const production = award.productionId ? await first<{ title: string }>('SELECT title FROM core_productions WHERE id = ?', award.productionId) : null
  return {
    award: { ...award, productionTitle: production?.title ?? null },
    canUpdate: (await can(actor, 'awards.award.update', ['awards.award', award.id])).allowed,
    canRevoke: award.state === 'current' && (await can(actor, 'awards.award.revoke', ['awards.award', award.id])).allowed,
  }
})
