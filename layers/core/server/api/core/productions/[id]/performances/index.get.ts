// A production's performances, in time order (C-03), and long runs still being made (C-04), with
// the lists the console's pickers offer: venues and the spaces in them that can hold performances,
// access features and cancel reasons.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { listPerformances } from '../../../../../programme/performances'
import { listVenues } from '../../../../../places/service'
import { openRuns } from '../../../../../programme/runs'
import { productionEffects } from '../../../../../programme/guidance'
import { listTerms } from '../../../../../vocabularies/service'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record }) => {
  const option = (t: { id: string, label: string, retired: boolean }) => ({ id: t.id, label: t.label, retired: t.retired })
  const [performances, runs, venues, access, reasons, effects] = await Promise.all([
    listPerformances({ productionId: record!.id }),
    openRuns(record!.id),
    listVenues({ archived: true }),
    listTerms('core.access-feature', { includeRetired: true }),
    listTerms('core.cancel-reason'),
    productionEffects(record!.id),
  ])
  const used = new Set(performances.flatMap(p => [p.venueId, p.spaceId]))
  return {
    performances,
    runs,
    options: {
      venues: venues
        .map(v => ({ id: v.id, name: v.name, archived: v.archived, spaces: v.spaces.filter(s => (s.performable && !s.archived) || used.has(s.id)).map(s => ({ id: s.id, name: s.name, defaultCapacity: s.defaultCapacity, archived: s.archived })) }))
        .filter(v => (!v.archived && v.spaces.length) || used.has(v.id)),
      access: access.map(option),
      reasons: reasons.map(option),
      effects: effects.map(e => ({ id: e.termId, label: e.label })),
    },
  }
})
