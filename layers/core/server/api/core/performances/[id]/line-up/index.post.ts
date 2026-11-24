// Adds an act to a performance's line-up, linked to a production or by name (C-61; LU1, LU2).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { addLineUpItem } from '../../../../../programme/line-ups'
import { inInstants } from '../../../../../programme/performances'
import { lineUpInput } from '../../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: lineUpInput,
}, async (_event, { unit, record, input }) => ({ id: await addLineUpItem(unit, record!.id, await inInstants(input)) }))
