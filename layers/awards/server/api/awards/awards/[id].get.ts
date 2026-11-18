// One award, with what the viewer may do to it.
import { getRouterParam } from 'h3'
import { can, defineRoute, first } from '#kit'
import { requireAward } from '../../../awards'

export default defineRoute({ ability: 'awards.award.view', record: event => ['awards.award', getRouterParam(event, 'id')], rateLimit: 'default' }, async (_event, { actor, record }) => {
  const award = await requireAward(record!.id)
  const production = award.productionId ? await first<{ title: string }>('SELECT title FROM core_productions WHERE id = ?', award.productionId) : null
  // The nomination it came from, for the link back: forms resolves the record for whoever may read it.
  const from = await first<{ responseId: string | null }>('SELECT response_id AS responseId FROM awards_awards WHERE id = ?', award.id)
  // Where the type lists its awards, for staff listing one the holder has not chosen for.
  const type = await first<{ defaultVisibility: string }>('SELECT default_visibility AS defaultVisibility FROM awards_types WHERE id = ?', award.typeId)
  return {
    award: { ...award, listingPending: !!award.listingPending, productionTitle: production?.title ?? null, responseId: from?.responseId ?? null, typeDefaultVisibility: type?.defaultVisibility ?? 'public' },
    canUpdate: (await can(actor, 'awards.award.update', ['awards.award', award.id])).allowed,
    canRevoke: award.state === 'current' && (await can(actor, 'awards.award.revoke', ['awards.award', award.id])).allowed,
  }
})
