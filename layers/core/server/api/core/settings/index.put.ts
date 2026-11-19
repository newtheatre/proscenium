// Saves a section of a settings page in one change: every value is checked first, and the rules see
// all the changes together, so related settings save in one go in any order; then all are written
// together with their history and audit rows, or none are. Resetting a section is the same
// save with `reset: true` on each of its settings.
import { z } from 'zod'
import { changeSettings, defineRoute, refuse } from '#kit'
import { mayChangeSetting } from '../../../settings/save'

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
  for (const change of input.changes) {
    await mayChangeSetting(actor, change.key)
    if (!change.reset && change.value === undefined) refuse('core.input.invalid', 'Give a value, or reset: true.', { status: 422, fields: { [change.key]: 'required' } })
  }
  const saved = await changeSettings(unit, input.changes.map(c => ({ key: c.key, value: c.value ?? null, reset: c.reset })), { reason: input.reason, confirm: input.confirm })
  return { saved }
})
