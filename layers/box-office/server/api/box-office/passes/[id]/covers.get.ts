// The tickets a pass's holder already has that it could cover (Matt, 19 November), for staff on the
// pass's holders list and at the till.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { coverChoicesFor } from '../../../../pass-covers'

export default defineRoute({
  ability: 'box-office.order.exchange',
  record: event => ['box-office.pass', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => coverChoicesFor(record!.id!))
