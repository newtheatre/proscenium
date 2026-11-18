// A production's usual space: the spaces it may name, and the one a new production in a season most
// likely uses (the only space there is, else the one its season's latest production used).
import { all, first } from '#kit'
import { listVenues } from '../places/service'

export interface SpaceOption { id: string, venueId: string, label: string }

/** Every space that can hold performances, named with its venue where there is more than one venue. */
export async function usualSpaceOptions(keep: string | null = null): Promise<SpaceOption[]> {
  const venues = (await listVenues({ archived: true })).filter(v => !v.archived || v.spaces.some(s => s.id === keep))
  const several = venues.length > 1
  return venues.flatMap(v => v.spaces
    .filter(s => (s.performable && !s.archived && !v.archived) || s.id === keep)
    .map(s => ({ id: s.id, venueId: v.id, label: several ? `${s.name}, ${v.name}` : s.name })))
}

/** The space a new production in this season is most likely to use, or null to leave it to the producer. */
export async function likelyUsualSpace(seasonId: string | null, options: SpaceOption[]): Promise<string | null> {
  if (options.length === 1) return options[0]!.id
  if (!seasonId) return null
  const ids = JSON.stringify(options.map(o => o.id))
  const named = await first<{ id: string }>(`SELECT usual_space_id AS id FROM core_productions
    WHERE season_id = ? AND usual_space_id IN (SELECT value FROM json_each(?)) ORDER BY created_at DESC LIMIT 1`, seasonId, ids)
  if (named) return named.id
  const played = await all<{ id: string }>(`SELECT p.space_id AS id FROM core_performances p JOIN core_productions r ON r.id = p.production_id
    WHERE r.season_id = ? AND p.state IN ('scheduled', 'completed') AND p.space_id IN (SELECT value FROM json_each(?)) ORDER BY p.starts_at DESC LIMIT 1`, seasonId, ids)
  return played[0]?.id ?? null
}
