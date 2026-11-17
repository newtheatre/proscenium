// Revert (settings build brief): sets a setting back to the value a history row shows it had before,
// through the ordinary save, so the same ability, rules and confirmation apply and the change gets
// its own history row with the reason "Reverted". A sensitive setting has no Revert.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { changeSetting, defineRoute, first, refuse } from '#kit'
import { defaultValue } from '#kit/settings'
import { currentKey } from '#kit/settings-store'
import { mayChangeSetting } from '../../../../../settings/save'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: z.object({ confirm: z.boolean().optional() }),
}, async (event, { input, actor, unit }) => {
  const id = getRouterParam(event, 'id') ?? ''
  const row = await first<{ key: string, old_value: string | null }>('SELECT key, old_value FROM core_setting_changes WHERE id = ?', id)
  if (!row) return refuse('core.not-found', 'There is no such change.', { status: 404 })
  const key = currentKey(row.key)
  const entry = await mayChangeSetting(actor, key)
  if (entry.sensitive) refuse('core.setting.sensitive', 'A hidden setting cannot be set back to an earlier value. Type a new value instead.', { status: 409 })
  const before = row.old_value === null ? null : JSON.parse(row.old_value) as unknown
  // Back to the default is a reset, so the setting follows the default again.
  const reset = JSON.stringify(before) === JSON.stringify(defaultValue(entry))
  const value = await changeSetting(unit, key, before, { reason: 'Reverted', reset, confirm: input.confirm })
  return { key, value }
})
