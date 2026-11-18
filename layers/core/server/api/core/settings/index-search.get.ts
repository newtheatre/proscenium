// The settings this viewer may open, for finding one by its words (UI-15). Labels and help are
// translations, which the browser holds, so this answers only where each setting is: its page and
// that page's address, or the bespoke screen that manages it. The search itself runs where the
// words are. A setting is found only when the viewer may open its page or screen, which is open to
// anyone who may change one of the settings on it. Sensitive settings and those the system keeps
// (the brand's revision, the logos the Branding screen sets) are never offered.
import { defineRoute } from '#kit'
import { enabledModules } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import { holds, mayOpen } from '../../../interface/navigation'
import { holdsAdmin } from '../../../interface/viewer'
import { moduleTabOf } from '../../../../shared/navigation'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const on = await enabledModules()
  const registry = useRegistry()
  const out: { key: string, module: string, page: string | null, screen: string | null, to: string, scope: 'module' | 'site', section: string, labelKey: string, helpKey: string }[] = []
  const homeOf = (key: string) => {
    const home = registry.settingHomes.get(key)!
    return home.page ?? `screen:${home.screen}`
  }
  const changers = new Map<string, Set<string>>()
  for (const [key, { module, entry }] of registry.settings) {
    if (on.has(module)) changers.set(homeOf(key), (changers.get(homeOf(key)) ?? new Set()).add(entry.change))
  }
  const open = new Map<string, boolean>()
  // A module's settings are a tab of its page in Admin; console staff open them in the console's settings window.
  let admin: boolean | undefined
  const linkTo = async (to: string) => {
    const tabOf = moduleTabOf({ menu: 'admin', to })
    if (!tabOf) return to
    admin ??= await holdsAdmin(actor)
    return admin ? to : `/console?settings=${tabOf}`
  }
  for (const [key, { module, entry }] of registry.settings) {
    if (!on.has(module) || entry.sensitive || entry.managed) continue
    const where = homeOf(key)
    if (!open.has(where)) open.set(where, holds(await mayOpen(actor, { ability: [...changers.get(where)!] })))
    if (!open.get(where)) continue
    const home = registry.settingHomes.get(key)!
    const page = home.page ? registry.settingPages.get(home.page)! : undefined
    const short = key.slice(module.length + 1)
    out.push({
      key,
      module,
      page: home.page ?? null,
      screen: home.screen ?? null,
      to: await linkTo(page?.to ?? home.screen!),
      scope: (page?.place ?? (home.screen!.startsWith('/admin/') ? 'admin' : 'console')) === 'admin' ? 'site' : 'module',
      section: short.split('.')[0]!,
      labelKey: `${module}.settings.${short}.label`,
      helpKey: `${module}.settings.${short}.help`,
    })
  }
  return { settings: out }
})
