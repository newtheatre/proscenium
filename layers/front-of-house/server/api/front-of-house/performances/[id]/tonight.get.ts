// The front of house section of Tonight for one performance (FH-19, FH-20).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { board } from '../../../../night'

export default defineRoute({
  ability: 'front-of-house.shift.view',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, (_event, { record, actor }) => board(record!.id!, actor))
