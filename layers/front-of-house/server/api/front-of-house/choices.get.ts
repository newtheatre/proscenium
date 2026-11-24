// The venues and spaces, duties, seasons and crew calls the console's set-up forms choose from. Names only, which members already
// see on open shifts, so any signed-in person may ask; the routes that save check their own ability.
import { all, defineRoute } from '#kit'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async () => ({
  venues: await all<{ id: string, name: string }>('SELECT id, name FROM core_venues WHERE state = \'active\' ORDER BY name'),
  spaces: await all<{ id: string, name: string, venueId: string }>('SELECT id, name, venue_id AS venueId FROM core_spaces ORDER BY name'),
  duties: await all<{ id: string, name: string }>('SELECT id, name FROM front_of_house_duties WHERE archived_at IS NULL ORDER BY sort_order, name'),
  seasons: await all<{ id: string, name: string }>('SELECT id, name FROM core_seasons WHERE state <> \'archived\' ORDER BY starts_on DESC, name'),
  crewCalls: await all<{ id: string, name: string }>('SELECT id, name FROM front_of_house_crew_calls WHERE state IN (\'draft\', \'open\') ORDER BY starts_on, name'),
}))
