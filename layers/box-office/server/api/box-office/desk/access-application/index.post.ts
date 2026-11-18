// Applies to the access scheme for somebody at the till, as staff, when they have never applied. The
// person is emailed, as when a reviewer applies for them, and a reviewer decides it; meanwhile the
// application is enough to book a wheelchair space, with the booking flagged for staff.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { accessApplicationInput } from '#modules/core'
import { deskApplyForAccess } from '../../../../desk'

export default defineRoute({
  // Selling is asked of the performance named, inside.
  ability: 'box-office.order.view',
  rateLimit: 'write',
  input: z.object({
    performanceId: z.string().min(1).max(64), // not-policy: an id
    accountId: z.string().min(1).max(64), // not-policy: an id
    application: accessApplicationInput,
  }).strict(),
}, async (_event, { input, unit }) => deskApplyForAccess(unit, input))
