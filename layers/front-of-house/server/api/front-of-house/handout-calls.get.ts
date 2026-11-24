// The crew calls whose handouts can be recorded now, for the live handouts menu (FH-50).
import { all, defineRoute } from '#kit'

export default defineRoute({ ability: 'front-of-house.handout.record', rateLimit: 'default' }, async () => ({
  calls: await all<{ id: string, name: string, starts_on: string, ends_on: string }>('SELECT id, name, starts_on, ends_on FROM front_of_house_crew_calls WHERE state IN (\'open\', \'closed\') ORDER BY starts_on DESC, name'),
}))
