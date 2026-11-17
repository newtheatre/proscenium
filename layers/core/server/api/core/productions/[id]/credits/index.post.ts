// Adds a credit at the end of its section. A linked person is told.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { addCredit } from '../../../../../programme/credits'
import { creditInput } from '../../../../../programme/input'
import { relyingParty } from '../../../../../identity/web'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: creditInput,
}, async (event, { input, unit, record }) => {
  const id = await addCredit(unit, record!.id, input, (await relyingParty(event)).origin)
  return { id }
})
