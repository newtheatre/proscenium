// Cancel my own data request before it runs (ID-16).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { cancelRequest, requestById } from '../../../../identity/data-requests'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input: z.object({}) }, async (event, { unit, actor }) => {
  const request = await requestById(getRouterParam(event, 'id')!)
  if (!request || request.account_id !== actor.accountId) refuse('core.not-found', 'There is no such request.', { status: 404 })
  await cancelRequest(unit, request, false)
  return { ok: true }
})
