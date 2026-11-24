// A paid booking's tickets to print at the till: each with its show, seats, type, holder, number
// and door code. Selling is asked of the booking's performance, once the order is read.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { deskPrintable } from '../../../../../desk'

export default defineRoute({
  ability: 'box-office.order.view',
  record: event => ['box-office.order', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
}, async (_event, { record }) => deskPrintable(record!.id!))
