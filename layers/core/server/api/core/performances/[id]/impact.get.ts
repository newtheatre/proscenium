// What a proposed change would touch, and the first module that refuses it, for the confirmation
// shown before a cancel, reschedule, move or capacity change (part 3, "Changes with a wide reach").
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { changeImpact, firstRefusal } from '../../../../programme/performances'
import { impactQuery } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
  input: impactQuery,
}, async (_event, { record, actor, input: { kind } }) => {
  const change = { record: { type: 'core.performance', id: record!.id }, kind }
  const refusal = await firstRefusal(change, actor)
  return { lines: await changeImpact(change, actor), refusal: refusal ? { code: refusal.code, reason: refusal.reason, link: refusal.link ?? null, question: refusal.question ?? null } : null }
})
