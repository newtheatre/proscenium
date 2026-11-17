// Openings (S5): what is trading now, and recent ones with their takings.
import { defineRoute } from '#kit'
import { listOpenings } from '../../../openings'

export default defineRoute({ ability: 'bar.opening.manage', rateLimit: 'default' }, async () => ({ openings: await listOpenings() }))
