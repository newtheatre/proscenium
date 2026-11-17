// What a setting's history row shows: the values before and after, who changed it and why, and
// whether it can be set back. A sensitive setting's values are never shown and it has no Revert.
import { all, can, type Actor } from '#kit'
import { useRegistry } from '#kit/registry'
import { currentKey } from '#kit/settings-store'

export interface ChangeRow { id: string, key: string, old_value: string | null, new_value: string | null, reason: string | null, at: number, actor: string | null, actor_name: string | null }

/** The latest change of each of these settings, for "Changed by <name>, <date>" under it. */
export async function lastChanges(keys: string[]): Promise<Map<string, { at: number, by: string | null }>> {
  const asked = [...new Set(keys.flatMap(key => [key, ...[...useRegistry().settingAliases].filter(([, now]) => now === key).map(([old]) => old)]))]
  const rows = await all<{ key: string, at: number, name: string | null }>(
    `SELECT key, at, name FROM (
       SELECT c.key, c.at, coalesce(a.preferred_name, a.name) AS name,
              row_number() OVER (PARTITION BY c.key ORDER BY c.at DESC, c.id DESC) AS n
         FROM core_setting_changes c LEFT JOIN core_accounts a ON a.id = c.actor
        WHERE c.key IN (SELECT value FROM json_each(?))
     ) WHERE n = 1`, JSON.stringify(asked))
  const out = new Map<string, { at: number, by: string | null }>()
  for (const row of rows) {
    const key = currentKey(row.key)
    if (!out.has(key) || out.get(key)!.at < row.at) out.set(key, { at: row.at, by: row.name })
  }
  return out
}

export async function changeView(row: ChangeRow, actor: Actor) {
  const registry = useRegistry()
  const key = currentKey(row.key)
  const found = registry.settings.get(key)
  const home = registry.settingHomes.get(key)
  const entry = found?.entry
  const sensitive = !entry || entry.sensitive === true
  const short = found ? key.slice(found.module.length + 1) : key
  return {
    id: row.id,
    key,
    module: found?.module ?? key.split('.')[0]!,
    page: home?.page ?? null,
    screen: home?.screen ?? null,
    labelKey: found ? `${found.module}.settings.${short}.label` : null,
    at: row.at,
    by: row.actor ? { id: row.actor, name: row.actor_name } : null,
    reason: row.reason,
    sensitive,
    before: sensitive || row.old_value === null ? null : JSON.parse(row.old_value) as unknown,
    after: sensitive || row.new_value === null ? null : JSON.parse(row.new_value) as unknown,
    revertible: !!entry && !sensitive && !entry.managed && (await can(actor, entry.change as never, undefined, { fresh: false })).allowed,
  }
}
