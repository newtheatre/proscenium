// Asks for a refund of a paid bar sale (BAR-19). Payments decides whether a second person approves it.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { refundInput, refundSale } from '../../../../refunds'

export default defineRoute({ ability: 'bar.sale.refund', rateLimit: 'write', input: refundInput }, async (event, { actor, unit, input }) =>
  await refundSale(unit.view(), getRouterParam(event, 'reference', { decode: true }) ?? '', input, actor.accountId ?? null))
