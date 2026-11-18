// The settings on one page of settings, as the generated page draws them (UI-14): value, default,
// whether it has been changed and by whom last, who may change it and whether the viewer is one of them.
// `?page=<id>` gives a generated page (`core.sign-in`, `core.advanced`, `box-office.settings`), and
// `?screen=<address>` the settings a bespoke screen manages (`/admin/email`). Every item names its
// page or screen. `?module` and `?scope` are the older form and answer for one release, until the
// generated page asks by page: `scope` is now where the setting's page is ('site' for Site
// administration, 'module' for the console).
import { z } from 'zod'
import { can, defineRoute, refuse } from '#kit'
import { enabledModules } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import { defaultValue, optionsOf, RATE_COUNT, RATE_PERIOD } from '#kit/settings'
import { isOverridden, useSetting } from '#kit/settings-store'
import { configuredOrigin, requestUrl } from '#kit/origin'
import { holds, mayOpen } from '../../../interface/navigation'
import { lastChanges } from '../../../settings/history'

const SITE_ORIGIN = 'core.site.origin'

const ID = /^[a-z][a-z0-9-]*$/ // not-policy: the pattern of a module id

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'default',
  input: z.object({
    page: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/).optional(), // not-policy: <module>.<page>
    screen: z.string().regex(/^\/(admin|console)(\/[a-z0-9-]+)+$/).optional(), // not-policy: an address under a shell
    module: z.string().regex(ID).optional(),
    scope: z.enum(['module', 'site']).optional(),
  }).refine(i => [i.page, i.screen, i.module ?? (i.scope === 'site' ? 'site' : undefined)].filter(v => v !== undefined).length === 1, { message: 'Ask for one page, one screen, or (the older form) a module or scope=site.' }),
}, async (event, { input, actor }) => {
  const registry = useRegistry()
  const on = await enabledModules()
  const placeOf = (pageId?: string) => pageId ? registry.settingPages.get(pageId)!.place : undefined
  const mine = [...registry.settings].filter(([key, s]) => {
    if (!on.has(s.module) || (s.entry.whenModule && !on.has(s.entry.whenModule))) return false
    const home = registry.settingHomes.get(key)!
    if (input.page !== undefined) return home.page === input.page
    if (input.screen !== undefined) return home.screen === input.screen
    if (!home.page) return false
    if (input.module !== undefined && s.module !== input.module) return false
    return input.scope === undefined || placeOf(home.page) === (input.scope === 'site' ? 'admin' : 'console')
  })
  if (!mine.length) return refuse('core.not-found', 'There is nothing here.', { status: 404 })
  const page = await mayOpen(actor, { ability: [...new Set(mine.map(([, s]) => s.entry.change))] })
  if (!holds(page)) return refuse('core.not-found', 'There is nothing here.', { status: 404 })

  const changed = await lastChanges(mine.map(([key]) => key))
  const out = []
  for (const [key, { module, entry }] of mine) {
    const home = registry.settingHomes.get(key)!
    const short = key.slice(module.length + 1)
    const [group, name] = short.split('.') as [string, string]
    const abilityModule = entry.change.split('.')[0]!
    const decision = await can(actor, entry.change as never)
    out.push({
      key,
      module,
      page: home.page ?? null,
      screen: home.screen ?? null,
      scope: placeOf(home.page) === 'admin' ? 'site' : 'module',
      group,
      name,
      kind: entry.kind,
      labelKey: `${module}.settings.${short}.label`,
      helpKey: `${module}.settings.${short}.help`,
      unitKey: entry.unit,
      value: entry.sensitive ? null : await useSetting(key as never),
      default: entry.sensitive ? null : defaultValue(entry),
      overridden: await isOverridden(key),
      /** The latest change, for "Changed by <name>, <date>" under the setting. */
      lastChange: changed.get(key) ?? null,
      /** A value to offer while nothing is recorded: for the site's address, the one this page came on. */
      suggestion: key === SITE_ORIGIN && !(await configuredOrigin()) ? requestUrl(event).origin : null,
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
      /** A duration's units, when it offers only some. */
      units: entry.kind === 'duration' ? entry.units : undefined,
      multiline: entry.multiline === true,
      /** A rate's period limits, written like 1m and 1d, for the period control. */
      periodMin: entry.kind === 'rate' ? RATE_PERIOD.min : undefined,
      periodMax: entry.kind === 'rate' ? RATE_PERIOD.max : undefined,
      /** A choice's values; where they come from a catalogue the screen labels them itself. */
      options: entry.kind === 'choice' || entry.of === 'choice' ? optionsOf(entry) : undefined,
      catalogue: entry.catalogue ?? null,
      of: entry.of,
      record: entry.record,
    })
  }
  const declared = input.page ? registry.settingPages.get(input.page) : undefined
  return {
    page: declared ? { id: input.page, module: declared.module, place: declared.place, to: declared.to, labelKey: declared.label } : null,
    screen: input.screen ?? null,
    module: input.module ?? null,
    scope: input.scope ?? null,
    settings: out,
  }
})
