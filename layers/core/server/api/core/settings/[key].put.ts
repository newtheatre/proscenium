// Changes or resets one setting (Settings registry: "Changing a setting"). The ability needed is
// the one the setting declares, checked here because it differs from setting to setting.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { changeSetting, defineRoute, refuse, requireAbility, useContext } from '#kit'
import { settingEntry } from '#kit/settings-store'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ value: z.unknown().optional(), reset: z.boolean().optional(), reason: z.string().max(500).optional(), confirm: z.boolean().optional() }), // not-policy: a sane length for a reason
}, async (event, { input, actor, unit }) => {
  const key = getRouterParam(event, 'key') ?? ''
  let entry
  try { entry = settingEntry(key) }
  catch { return refuse('core.setting.unknown', `There is no setting called ${key}.`, { status: 404 }) }
  const context = useContext()
  context.allowedBy = await requireAbility(actor, entry.change as any)
  context.ability = entry.change
  if (entry.managed) refuse('core.setting.managed', 'This setting is kept up to date by the system and cannot be changed here.', { status: 409 })
  if (!input.reset && input.value === undefined) refuse('core.input.invalid', 'Give a value, or reset: true.', { status: 422, fields: { value: 'required' } })
  const value = await changeSetting(unit, key, input.value ?? null, { reason: input.reason, reset: input.reset, confirm: input.confirm })
  return { key, value }
})
