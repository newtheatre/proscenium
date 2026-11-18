// The passes of one kind that people hold, for the staff list: who holds each, what it has booked
// and whether it is paid for.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { holdersOf } from '../../../../pass-holding'

export default defineRoute({
  ability: 'box-office.pass.manage',
  record: event => ['box-office.pass-type', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => ({ rows: await holdersOf(record!.id!) }))
