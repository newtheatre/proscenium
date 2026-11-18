// A pass scanned or typed in the till's find box (BO-64): the pass, its holder and what is still to
// pay for it, judged for the performance the till is selling, so its entry joins the sale; or why it
// cannot be used there. The seller has the holder in front of them, so a pass in someone's name is
// not refused for being theirs.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { deskPass } from '../../../pass-entries'

export default defineRoute({
  // Selling is asked of the performance named, inside.
  ability: 'box-office.order.view',
  rateLimit: 'default',
  input: z.object({
    performanceId: z.string().min(1).max(64), // not-policy: an id
    code: z.string().trim().min(1).max(500), // not-policy: longer than any old system's pass code
  }).strict(),
}, async (_event, { input }) => deskPass(input.code, input.performanceId))
