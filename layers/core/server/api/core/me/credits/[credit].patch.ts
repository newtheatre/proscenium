// The linked person chooses who sees their own credit: public, members only or hidden. No ability is
// needed (part 6); the credit must be linked to the caller, and nothing else about it changes here.
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { setOwnVisibility } from '../../../../programme/credits'
import { ownCreditInput } from '../../../../programme/input'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: ownCreditInput }, async (event, { input, unit, actor }) => {
  const id = getRouterParam(event, 'credit', { decode: true })!
  await setOwnVisibility(unit, actor.accountId!, id, input.visibility)
  return { id }
})
