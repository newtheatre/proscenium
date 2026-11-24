// Withdraw your own complimentary request before it is decided (BO-62).
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, refuse } from '#kit'
import { closeComps, compById } from '../../../../comps'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}).strict() }, async (event, { unit }) => {
  const request = await compById(getRouterParam(event, 'id', { decode: true }) ?? '')
  if (!request) refuse('box-office.comp.not-found', 'There is no such request.', { status: 404 })
  await closeComps(unit.view(), request, 'withdrawn')
  return { state: 'withdrawn' }
})
