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
    // `references`: student IDs or member numbers typed in place of signing in, one for each ticket of a member type.
    lines: z.array(z.object({ bandId: idSchema('band'), ticketTypeId: idSchema('tty'), quantity: z.number().int().min(1).max(50), references: z.array(z.string().max(64)).max(50).optional() }).strict()).max(20), // not-policy: shape bounds
    // A promo code as the buyer typed it (BO-17).
    promoCode: z.string().trim().max(40).optional(), // not-policy: longer than any code
    // Passes, by their codes (BO-64): each gives one entry at no charge, in a wheelchair space where asked.
    passes: z.array(z.object({ code: z.string().trim().min(4).max(40), bandId: idSchema('band').optional(), wheelchair: z.boolean().optional() }).strict()).max(20).optional(), // not-policy: shape bounds
    // Passes bought with this booking, each giving its first entry here.
    buy: z.array(z.object({ passTypeId: idSchema('pty'), passPriceId: idSchema('ppr'), bandId: idSchema('band').optional(), wheelchair: z.boolean().optional() }).strict()).max(20).optional(), // not-policy: shape bounds
  }).strict().refine(v => v.lines.length + (v.passes?.length ?? 0) + (v.buy?.length ?? 0) > 0, 'Choose at least one ticket.'),
}, (_event, { input, unit }) => createBasket(unit.view(), input))
