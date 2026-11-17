// The Modules screen (foundations part 7): every module this installation has, whether it is on,
// what it needs and what needs it, which of its secrets and credentials are set, and the screens it
// adds. Names and descriptions are the client's, from each module's catalogue. Secret values never
// leave the server; only whether each is set.
import { can, defineRoute } from '#kit'
import { holds } from '../../../interface/navigation'
import { enabledModules, missingSecrets, requiredOff } from '#kit/modules-store'
import { useRegistry } from '#kit/registry'
import { useContext } from '#kit/context'
import type { NavigationEntry } from '../../../../shared/navigation'

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
  const modules = []
  for (const [id, entry] of registry.modules) {
    const m = entry.manifest
    const alwaysOn = id === 'core' || m.switchable === false
    const screens = ((m.contributes?.['core.navigation'] ?? []) as unknown as NavigationEntry[])
      .filter(e => e.menu !== 'account')
      .map(e => ({ id: e.id, menu: e.menu ?? 'console' }))
    modules.push({
      id,
      owner: entry.owner,
      since: m.since,
      stability: m.stability ?? 'stable',
      alwaysOn,
      on: on.has(id),
      requires: [...(m.requires ?? [])],
      uses: [...(m.uses ?? [])],
      requiredBy: [...registry.modules.values()].filter(o => o.manifest.requires?.includes(id)).map(o => o.manifest.id),
      alsoOn: on.has(id) ? [] : await requiredOff(id),
      secrets: Object.entries(m.secrets ?? {}).map(([name, decl]) => ({ name, needed: decl.needed, set: isSet(env, name) })),
      credentials: Object.entries(m.credentials ?? {}).map(([name, decl]) => ({ name, needed: decl.needed, set: stored.has(`${id} ${name}`) || isSet(env, name) })),
      missingSecrets: missingSecrets(id),
      screens,
      changedAt: (on.has(id) ? rows.get(id)?.enabled_at : rows.get(id)?.disabled_at) ?? null,
    })
  }
  // Holding the ability is enough to be offered the switches; a fresh sign-in is asked on the switch.
  const manage = holds(await can(actor, 'core.modules.manage'))
  return { modules, manage }
})

function isSet(env: object, name: string): boolean {
  const value = (env as Record<string, unknown>)[name]
  return typeof value === 'string' && value.length > 0
}
