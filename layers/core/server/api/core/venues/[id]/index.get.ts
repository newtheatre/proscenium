// One venue, its spaces and the access features of each, with the two lists its pickers offer
// (retired terms included, marked, so a space that still uses one shows its label).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { getVenue } from '../../../../places/service'
import { listTerms } from '../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.venue.manage',
  record: event => ['core.venue', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record }) => {
  const option = (t: { id: string, label: string, icon: string | null, retired: boolean }) => ({ id: t.id, label: t.label, icon: t.icon, retired: t.retired })
  const [venue, kinds, features] = await Promise.all([
    getVenue(record!.id),
    listTerms('core.space-kind', { includeRetired: true }),
    listTerms('core.place-access', { includeRetired: true }),
  ])
  return { venue, kinds: kinds.map(option), features: features.map(option) }
})
