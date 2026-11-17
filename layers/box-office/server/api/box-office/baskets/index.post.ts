// Hold tickets (BO-11, BO-13, BO-14): anyone may start a basket. Every ticket asked for is held
// together or none is, and the last seat goes to exactly one basket.
import { z } from 'zod'
import { defineRoute, idSchema } from '#kit'
import { createBasket } from '../../../baskets'

export default defineRoute({
  public: true,
  rateLimit: 'write',
  protect: 'turnstile',
  input: z.object({
    performanceId: idSchema('perf'),
    // The bounds of a request's shape; the order cap is the setting box-office.orders.seat-cap.
    lines: z.array(z.object({ bandId: idSchema('band'), ticketTypeId: idSchema('tty'), quantity: z.number().int().min(1).max(50) }).strict()).min(1).max(20), // not-policy: shape bounds
    // A promo code as the buyer typed it (BO-17).
    promoCode: z.string().trim().max(40).optional(), // not-policy: longer than any code
  }).strict(),
}, (_event, { input, unit }) => createBasket(unit.view(), input))
