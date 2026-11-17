// Changes or resets one setting (Settings registry: "Changing a setting"). The ability needed is
// the one the setting declares, checked here because it differs from setting to setting. A fresh
// sign-in is asked for only when the setting asks for confirmation or a reason.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { changeSetting, defineRoute, refuse } from '#kit'
import { mayChangeSetting } from '../../../settings/save'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ value: z.unknown().optional(), reset: z.boolean().optional(), reason: z.string().max(500).optional(), confirm: z.boolean().optional() }), // not-policy: a sane length for a reason
}, async (event, { input, actor, unit }) => {
  const key = getRouterParam(event, 'key') ?? ''
  await mayChangeSetting(actor, key)
  if (!input.reset && input.value === undefined) refuse('core.input.invalid', 'Give a value, or reset: true.', { status: 422, fields: { value: 'required' } })
  const value = await changeSetting(unit, key, input.value ?? null, { reason: input.reason, reset: input.reset, confirm: input.confirm })
  return { key, value }
})
