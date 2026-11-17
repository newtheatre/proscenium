// The one way a person's change to a setting is let through, for the settings routes and Revert:
// the ability the setting names, a re-asserted sign-in only for a setting that asks for confirmation
// or a reason (Matt, 16 November), and never a setting the system keeps up to date.
import { refuse, requireAbility, useContext, type Actor } from '#kit'
import { settingEntry } from '#kit/settings-store'
import type { SettingEntry } from '#kit/settings'

export async function mayChangeSetting(actor: Actor, key: string): Promise<SettingEntry> {
  let entry: SettingEntry
  try { entry = settingEntry(key) }
  catch { return refuse('core.setting.unknown', `There is no setting called ${key}.`, { status: 404 }) }
  const context = useContext()
  context.allowedBy = await requireAbility(actor, entry.change as never, undefined, { fresh: entry.onChange !== undefined })
  context.ability = entry.change
  if (entry.managed) refuse('core.setting.managed', 'This setting is kept up to date by the system and cannot be changed here.', { status: 409 })
  return entry
}
