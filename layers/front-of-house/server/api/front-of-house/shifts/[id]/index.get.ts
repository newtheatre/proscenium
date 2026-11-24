// One shift, as a member sees it: what it is, who else is on it and their own place.
import { getRouterParam } from 'nuxt/server'
import { defineRoute, refuse } from '#kit'
import { shiftView } from '../../../../lists'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (event, { actor }) => {
  const view = await shiftView(getRouterParam(event, 'id', { decode: true })!, actor.accountId!)
  if (!view) refuse('core.not-found', 'There is no such shift.', { status: 404 })
  return view
})
