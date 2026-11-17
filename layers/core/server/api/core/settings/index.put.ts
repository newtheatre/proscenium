// Saves a section of a settings page in one change: every value is checked first, then all are
// written together with their history and audit rows, or none are.
import { z } from 'zod'
import { changeSetting, defineRoute, refuse, requireAbility, useContext } from '#kit'
import { settingEntry } from '#kit/settings-store'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({
    changes: z.array(z.object({ key: z.string(), value: z.unknown().optional(), reset: z.boolean().optional() })).min(1).max(100), // not-policy: one section of a page
    reason: z.string().max(500).optional(), // not-policy: a sane length for a reason
    /** The person has seen what will change and confirmed it, for a setting declared onChange: 'confirm'. */
    confirm: z.boolean().optional(),
  }),
}, async (_event, { input, actor, unit }) => {
  const context = useContext()
  const saved: Record<string, unknown> = {}
  for (const change of input.changes) {
    let entry
    try { entry = settingEntry(change.key) }
    catch { return refuse('core.setting.unknown', `There is no setting called ${change.key}.`, { status: 404 }) }
    context.allowedBy = await requireAbility(actor, entry.change as never)
    context.ability = entry.change
    if (entry.managed) refuse('core.setting.managed', 'This setting is kept up to date by the system and cannot be changed here.', { status: 409 })
    if (!change.reset && change.value === undefined) refuse('core.input.invalid', 'Give a value, or reset: true.', { status: 422, fields: { [change.key]: 'required' } })
    saved[change.key] = await changeSetting(unit, change.key, change.value ?? null, { reason: input.reason, reset: change.reset, confirm: input.confirm })
  }
  return { saved }
})
