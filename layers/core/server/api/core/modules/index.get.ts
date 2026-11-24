// The Modules screen (foundations part 7): every module this installation has, whether it is on,
// what it needs and what needs it, which of its secrets and credentials are set, and the screens it
// adds. Names and descriptions are the client's, from each module's catalogue. Secret values never
// leave the server; only whether each is set.
import { can, defineRoute, usePoint } from '#kit'
import type { CredentialUse } from '../../../points/credential-use'
import { declaredGroups, holds, moduleTabs } from '../../../interface/navigation'
import { enabledModules, missingSecrets, requiredOff } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import { useContext } from '#kit/context'
import { moduleHome, type NavigationEntry } from '../../../../shared/navigation'

export default defineRoute({ ability: 'core.health.view', rateLimit: 'default' }, async (_event, { actor }) => {
  const registry = useRegistry()
  const on = await enabledModules()
  const env = useContext().env
  const stored = await env.DB.prepare('SELECT module_id, name FROM core_credentials').all<{ module_id: string, name: string }>()
    .then(r => new Set(r.results.map(c => `${c.module_id} ${c.name}`)))
    .catch(() => new Set<string>())
  const rows = await env.DB.prepare('SELECT module_id, enabled_at, disabled_at FROM core_modules').all<{ module_id: string, enabled_at: number | null, disabled_at: number | null }>()
    .then(r => new Map(r.results.map(m => [m.module_id, m])))
    .catch(() => new Map<string, { enabled_at: number | null, disabled_at: number | null }>())
  const groups = await declaredGroups()
  const lacking = await lackingCredentials()
  const modules = []
  for (const [id, entry] of registry.modules) {
    const m = entry.manifest
    const alwaysOn = id === 'core' || m.switchable === false
    const screens = ((m.contributes?.['core.navigation'] ?? []) as unknown as NavigationEntry[])
      .filter(e => e.menu !== 'account')
      .map(e => ({ id: e.id, menu: e.menu ?? 'console' }))
    const tabs = await moduleTabs(actor, id)
    const home = moduleHome(id)
    modules.push({
      id,
      owner: entry.owner,
      since: m.since,
      stability: m.stability ?? 'stable',
      alwaysOn,
      // A support module (C-65) has no switch: it is on while a module that is on requires it.
      support: m.support === true,
      on: on.has(id),
      requires: [...(m.requires ?? [])],
      uses: [...(m.uses ?? [])],
      // Modules that add to this one's points, such as Box office's figures on Front of house's board.
      worksWith: [...registry.modules.values()].filter(o => o.manifest.id !== id && !(m.uses ?? []).includes(o.manifest.id) && Object.keys(o.manifest.contributes ?? {}).some(point => point in (m.points ?? {}))).map(o => o.manifest.id),
      requiredBy: [...registry.modules.values()].filter(o => o.manifest.requires?.includes(id)).map(o => o.manifest.id),
      alsoOn: on.has(id) ? [] : await requiredOff(id),
      secrets: Object.entries(m.secrets ?? {}).map(([name, decl]) => ({ name, needed: decl.needed, set: isSet(env, name) })),
      credentials: Object.entries(m.credentials ?? {}).map(([name, decl]) => {
        const set = stored.has(`${id} ${name}`) || isSet(env, name)
        // One saved per record is asked for only while a record in use lacks it.
        const perRecord = decl.needed === 'when-used' && !decl.manage
        const step = decl.needed === 'optional' ? null : perRecord ? (lacking.get(id)?.has(name) ? false : null) : set
        return { name, needed: decl.needed, set, step }
      }),
      missingSecrets: missingSecrets(id),
      screens,
      // The module's own console group's icon, else its first screen's.
      icon: groups.find(g => g.module === id)?.icon ?? (m.contributes?.['core.navigation'] as unknown as NavigationEntry[] | undefined)?.find(e => e.menu !== 'account')?.icon ?? 'i-lucide-blocks',
      /** How many of its settings are on its page here. */
      settings: [...registry.settings].filter(([key, s]) => s.module === id && onPage(registry.settingPages.get(registry.settingHomes.get(key)?.page ?? '')?.to, home)).length,
      /** Where the catalogue opens the module for this viewer: its first tab they may open. */
      open: tabs[0]?.to ?? null,
      changedAt: (on.has(id) ? rows.get(id)?.enabled_at : rows.get(id)?.disabled_at) ?? null,
    })
  }
  // Holding the ability is enough to be offered the switches; a fresh sign-in is asked on the switch.
  const manage = holds(await can(actor, 'core.modules.manage'))
  return { modules, manage }
})

/** Per module, the per-record credentials a record in use lacks. A source that fails asks for nothing. */
async function lackingCredentials(): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  for (const { module, value } of await usePoint<CredentialUse>('core.credential-use')) {
    const names = await value.missing().catch(() => [] as string[])
    out.set(module, new Set([...(out.get(module) ?? []), ...names]))
  }
  return out
}

const onPage = (to: string | undefined, home: string) => to === home || !!to?.startsWith(`${home}/`)

function isSet(env: object, name: string): boolean {
  const value = (env as Record<string, unknown>)[name]
  return typeof value === 'string' && value.length > 0
}
