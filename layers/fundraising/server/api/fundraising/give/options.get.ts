// The Give page's choices (P3): amounts, limits, the funds a donor may choose, and the campaign
// given to, when the page was opened from one.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { giveOptions } from '../../../giving'

const query = z.object({ campaign: z.string().trim().max(80).optional(), fund: z.string().max(40).optional() }).strict() // not-policy: the slug's and id's bounds

export default defineRoute({ public: true, rateLimit: 'default', input: query }, (_event, { input }) => giveOptions(input.campaign, input.fund))
