// The settings of one module as the generated settings page shows them (UI-14): value, default,
// whether it has been changed, who may change it and whether the viewer is one of them.
import { z } from 'zod'
import { can, defineRoute, refuse } from '#kit'
import { useRegistry } from '#kit/registry'
import { defaultValue } from '#kit/settings'
import { isOverridden, useSetting } from '#kit/settings-store'
import { holds, mayOpen } from '../../../interface/navigation'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({ module: z.string().regex(/^[a-z][a-z0-9-]*$/) }), // not-policy: the pattern of a module id
}, async (_event, { input, actor }) => {
  const registry = useRegistry()
  const mine = [...registry.settings].filter(([, s]) => s.module === input.module)
  if (!mine.length) return refuse('core.not-found', 'There is nothing here.', { status: 404 })
  const page = await mayOpen(actor, { ability: [...new Set(mine.map(([, s]) => s.entry.change))] })
  if (!holds(page)) return refuse('core.not-found', 'There is nothing here.', { status: 404 })

  const out = []
  for (const [key, { entry }] of mine) {
    const short = key.slice(input.module.length + 1)
    const [group, name] = short.split('.') as [string, string]
    const abilityModule = entry.change.split('.')[0]!
    const decision = await can(actor, entry.change as never)
    out.push({
      key,
      group,
      name,
      kind: entry.kind,
      labelKey: `${input.module}.settings.${short}.label`,
      helpKey: `${input.module}.settings.${short}.help`,
      unitKey: entry.unit,
      value: entry.sensitive ? null : await useSetting(key as never),
      default: entry.sensitive ? null : defaultValue(entry),
      overridden: await isOverridden(key),
      unset: entry.unset === true,
      sensitive: entry.sensitive === true,
      managed: entry.managed === true,
      quotable: entry.quotable === true,
      changeAbility: entry.change,
      changeLabelKey: `${abilityModule}.abilities.${entry.change.slice(abilityModule.length + 1)}.label`,
      canChange: decision.allowed && !entry.managed,
      min: entry.min,
      max: entry.max,
      maxLength: entry.maxLength,
      options: entry.options,
      of: entry.of,
    })
  }
  return { module: input.module, settings: out }
})
