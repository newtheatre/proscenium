// The settings this viewer may open, for finding one by its words (UI-15). Labels and help are
// translations, which the browser holds, so this answers only where each setting is and which of
// them the viewer may change; the search itself runs where the words are.
import { defineRoute } from '#kit'
import { enabledModules } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import { holds, mayOpen } from '../../../interface/navigation'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => {
  const on = await enabledModules()
  const registry = useRegistry()
  const out: { key: string, module: string, section: string, labelKey: string, helpKey: string }[] = []
  const pages = new Map<string, boolean>()
  for (const [key, { module, entry }] of registry.settings) {
    if (!on.has(module) || entry.sensitive) continue
    // A person finds only settings on a page they may open: the page is open to anyone who may change one of its settings.
    if (!pages.has(module)) {
      const changers = [...registry.settings.values()].filter(s => s.module === module).map(s => s.entry.change)
      pages.set(module, holds(await mayOpen(actor, { ability: [...new Set(changers)] })))
    }
    if (!pages.get(module)) continue
    const short = key.slice(module.length + 1)
    out.push({ key, module, section: short.split('.')[0]!, labelKey: `${module}.settings.${short}.label`, helpKey: `${module}.settings.${short}.help` })
  }
  return { settings: out }
})
