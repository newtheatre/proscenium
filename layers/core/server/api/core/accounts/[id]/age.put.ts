// Record or clear the day a person under 18 turns 18, after seeing ID (C-74).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { setAgeMarker } from '../../../../identity/age'

export default defineRoute({
  ability: 'core.age.record',
  record: event => ['core.account', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({ turns18On: z.string().max(10).nullable() }).strict(), // not-policy: a date's length
}, async (_event, { input, unit, actor, record }) => {
  await setAgeMarker(unit, actor, record!.id, input.turns18On, 'staff')
  return { id: record!.id, recorded: input.turns18On !== null }
})
