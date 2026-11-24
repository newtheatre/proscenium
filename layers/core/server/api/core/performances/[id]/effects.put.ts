// Replaces the staging effects a performance does not use (C-55).
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { setPerformanceEffectExceptions } from '../../../../programme/performances'
import { effectExceptionsInput } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  input: effectExceptionsInput,
}, async (_event, { unit, record, input }) => {
  await setPerformanceEffectExceptions(unit, record!.id, input.termIds)
  return { id: record!.id }
})
