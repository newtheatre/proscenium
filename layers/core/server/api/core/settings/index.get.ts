// The settings of one module, or the site's, as the generated settings page shows them (UI-14):
// value, default, whether it has been changed, who may change it and whether the viewer is one of
// them. `?module=x` gives every setting of the module, each with its scope; `&scope=module` narrows
// it to the module's own page in the console; `?scope=site` gives every setting shown under
// /admin/settings, whichever module declares it (R-33).
import { z } from 'zod'
import { can, defineRoute, refuse } from '#kit'
import { enabledModules } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import { defaultValue, RATE_COUNT } from '#kit/settings'
import { isOverridden, useSetting } from '#kit/settings-store'
import { holds, mayOpen } from '../../../interface/navigation'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({
    module: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(), // not-policy: the pattern of a module id
    scope: z.enum(['module', 'site']).optional(),
  }).refine(i => i.module !== undefined || i.scope === 'site', { message: 'Name a module, or ask for scope=site.' }),
}, async (_event, { input, actor }) => {
  const registry = useRegistry()
  const on = input.module === undefined ? await enabledModules() : undefined
  const mine = [...registry.settings].filter(([, s]) =>
    (input.module === undefined ? on!.has(s.module) : s.module === input.module)
    && (input.scope === undefined || (s.entry.scope ?? 'module') === input.scope))
  if (!mine.length) return refuse('core.not-found', 'There is nothing here.', { status: 404 })
  const page = await mayOpen(actor, { ability: [...new Set(mine.map(([, s]) => s.entry.change))] })
  if (!holds(page)) return refuse('core.not-found', 'There is nothing here.', { status: 404 })

  const out = []
  for (const [key, { module, entry }] of mine) {
    const short = key.slice(module.length + 1)
    const [group, name] = short.split('.') as [string, string]
    const abilityModule = entry.change.split('.')[0]!
    const decision = await can(actor, entry.change as never)
    out.push({
      key,
      module,
      scope: entry.scope ?? 'module',
      group,
      name,
      kind: entry.kind,
      labelKey: `${module}.settings.${short}.label`,
      helpKey: `${module}.settings.${short}.help`,
      unitKey: entry.unit,
      value: entry.sensitive ? null : await useSetting(key as never),
      default: entry.sensitive ? null : defaultValue(entry),
      overridden: await isOverridden(key),
      unset: entry.unset === true,
      sensitive: entry.sensitive === true,
      managed: entry.managed === true,
      quotable: entry.quotable === true,
      onChange: entry.onChange ?? null,
      changeAbility: entry.change,
      changeLabelKey: `${abilityModule}.abilities.${entry.change.slice(abilityModule.length + 1)}.label`,
      canChange: decision.allowed && !entry.managed,
      min: entry.kind === 'rate' ? RATE_COUNT.min : entry.min,
      max: entry.kind === 'rate' ? RATE_COUNT.max : entry.max,
      maxLength: entry.maxLength,
      options: entry.options,
      of: entry.of,
    })
  }
  return { module: input.module ?? null, scope: input.scope ?? null, settings: out }
})
