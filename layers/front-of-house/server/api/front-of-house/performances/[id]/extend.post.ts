// "Extend tonight": every published shift's window closes half an hour later (FH-23).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { extendTonight } from '../../../../night'

export default defineRoute({
  ability: 'front-of-house.assignment.check-in',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({}).strict(),
}, (_event, { record, unit }) => extendTonight(unit.view(), record!.id!))
