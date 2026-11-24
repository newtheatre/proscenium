// One venue, its spaces and the access features of each, with the lists its pickers offer (retired
// terms included, marked, so a space that still uses one shows its label), the run presets a space
// may start from, and the theatre's own preset and doors time its empty fields stand for.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { all, defineRoute, nowMs, useSetting } from '#kit'
import { getVenue } from '../../../../places/service'
import { listTerms } from '../../../../vocabularies/service'
import { listRunPresets, theatreRunPreset } from '../../../../programme/run-presets'
import { theatreDefaults } from '../../../../programme/performances'

export default defineRoute({
  ability: 'core.venue.manage',
  record: event => ['core.venue', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
  input: z.object({}),
}, async (_event, { record }) => {
  const option = (t: { id: string, label: string, icon: string | null, retired: boolean }) => ({ id: t.id, label: t.label, icon: t.icon, retired: t.retired })
  const upcomingRows = all<{ id: string, production_id: string, title: string, space: string, starts_at: number }>(
    `SELECT p.id, p.production_id, pr.title, s.name AS space, p.starts_at FROM core_performances p
     JOIN core_productions pr ON pr.id = p.production_id JOIN core_spaces s ON s.id = p.space_id
     WHERE p.venue_id = ? AND p.state = 'scheduled' AND p.ends_at > ? ORDER BY p.starts_at LIMIT 10`, record!.id, nowMs()) // not-policy: how many a list shows before saying there are more
  const [venue, kinds, features, presets, usualPreset, theatre, upcoming, country] = await Promise.all([
    getVenue(record!.id),
    listTerms('core.space-kind', { includeRetired: true }),
    listTerms('core.place-access', { includeRetired: true }),
    listRunPresets(),
    theatreRunPreset(),
    theatreDefaults(),
    upcomingRows,
    useSetting('core.organisation.country') as Promise<string>,
  ])
  return {
    venue,
    kinds: kinds.map(option),
    features: features.map(option),
    // A space's usual run preset and doors time, over the theatre's.
    presets: presets.map(p => ({ id: p.id, name: p.name })),
    usualPreset,
    doorsBeforeMinutes: theatre.doorsBeforeMinutes,
    // The performances still to come in any of its spaces, which keep it from being archived; and the theatre's own country, which a new venue's starts from.
    upcoming: upcoming.map(r => ({ id: r.id, productionId: r.production_id, title: r.title, space: r.space, startsAt: r.starts_at })),
    theatreCountry: country,
  }
})
