// Makes a seating layout its space's usual one.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { makeUsual } from '../../../../layouts'

export default defineRoute({
  ability: 'box-office.pricing.manage',
  record: event => ['box-office.seating-layout', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({}).strict(),
}, async (_event, { unit, record }) => {
  await makeUsual(unit.view(), record!.id!)
  return { ok: true }
})
