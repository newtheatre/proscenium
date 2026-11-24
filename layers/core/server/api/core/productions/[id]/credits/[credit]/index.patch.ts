// Changes a credit: its printed name, role, section, link or visibility. A newly linked person is told.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { updateCredit } from '../../../../../../programme/credits'
import { creditPatch } from '../../../../../../programme/input'
import { relyingParty } from '../../../../../../identity/web'

export default defineRoute({
  ability: 'core.production.edit',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: creditPatch,
}, async (event, { input, unit, record }) => {
  const id = getRouterParam(event, 'credit', { decode: true })!
  await updateCredit(unit, record!.id, id, input, (await relyingParty(event)).origin)
  return { id }
})
