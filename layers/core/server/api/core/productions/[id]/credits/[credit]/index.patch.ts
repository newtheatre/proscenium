// Changes a credit: its printed name, role, section, link or visibility. A newly linked person is told.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateCredit } from '../../../../../../programme/credits'
import { creditPatch } from '../../../../../../programme/input'
import { relyingParty } from '../../../../../../identity/web'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: creditPatch,
}, async (event, { input, unit, record }) => {
  const id = getRouterParam(event, 'credit')!
  await updateCredit(unit, { productionId: record!.id, creditId: id, origin: (await relyingParty(event)).origin }, input)
  return { id }
})
