// The rota grid (FH-48): occasion shifts by show night across and by venue and duty down, with a
// count of each night's performance shifts per venue.
import { z } from 'zod'
import { can, defineRoute } from '#kit'
import { gridView } from '../../grid'

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: a date's shape

export default defineRoute({
  ability: 'front-of-house.shift.view',
  rateLimit: 'default',
  input: z.object({
    from: DAY,
    to: DAY,
    crewCallId: z.string().min(1).max(40).optional(), // not-policy: shape bound
    venueId: z.string().min(1).max(40).optional(), // not-policy: shape bound
    dutyId: z.string().min(1).max(40).optional(), // not-policy: shape bound
    unfilled: z.enum(['1']).optional(),
  }).refine(q => q.from <= q.to, { message: 'The range must start before it ends.', path: ['to'] }),
}, async (_event, { input, actor }) => ({
  ...await gridView({ ...input, unfilled: input.unfilled === '1' }),
  can: { manage: (await can(actor, 'front-of-house.shift.manage')).allowed },
}))
