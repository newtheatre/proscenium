// One production with its content warnings and staging effects, what publishing still needs, and the lists its pickers offer.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { getProduction, listSeasons, publishingNeeds } from '../../../../programme/service'
import { listTermGroups, listTerms } from '../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record }) => {
  const option = (t: { id: string, label: string, retired: boolean }) => ({ id: t.id, label: t.label, retired: t.retired })
  const [production, needs, categories, advisories, groups, effects, reasons, seasons] = await Promise.all([
    getProduction(record!.id),
    publishingNeeds(record!.id),
    listTerms('core.production-category', { includeRetired: true }),
    listTerms('core.advisory', { includeRetired: true }),
    listTermGroups('core.advisory'),
    listTerms('core.staging-effect', { includeRetired: true }),
    listTerms('core.cancel-reason'),
    listSeasons(),
  ])
  return {
    production,
    needs,
    options: { categories: categories.map(option), advisories: advisories.map(t => ({ ...option(t), description: t.description, groupId: t.groupId })), advisoryGroups: groups.map(g => ({ id: g.id, label: g.label })), effects: effects.map(t => ({ ...option(t), description: t.description, icon: t.icon })), reasons: reasons.map(option), seasons: seasons.filter(s => s.state !== 'archived' || s.id === production.seasonId).map(s => ({ id: s.id, name: s.name })) },
  }
})
