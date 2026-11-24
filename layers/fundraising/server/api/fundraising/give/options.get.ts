// The Give page's choices (P3): amounts, limits and the funds a donor may choose.
import { defineRoute } from '#kit'
import { giveOptions } from '../../../giving'

export default defineRoute({ public: true, rateLimit: 'default' }, () => giveOptions())
