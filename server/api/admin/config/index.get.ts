import { eq, sql } from 'drizzle-orm'
import { CONFIG_KEYS, CONFIG_KEY_NAMES, hasDefault, holdsPeople, isEnforced, isSensitive, plannedFor } from '#shared/utils/config'
import type { ConfigKey } from '#shared/utils/config'

// Every setting, with what it ships as, what it is now, and who last moved it (J-104 criterion 2).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'config.read')

  const rows = await db.select({
    key: schema.config.key,
    value: schema.config.value,
    updatedAt: schema.config.updatedAt,
    editorId: schema.users.id,
    editorName: schema.users.name,
  })
    .from(schema.config)
    .leftJoin(schema.users, eq(schema.users.id, schema.config.updatedBy))

  const overrides = new Map(rows.map(row => [row.key, row]))
  const wideBlastRadius = new Set(await configValue(event, 'WIDE_BLAST_RADIUS_KEYS'))

  // An id means nothing to a reader, so a key holding people is named here, to config.read alone:
  // the audit trail keeps its hash (0024). One JSON parameter for every id on every such key.
  const standing = (key: ConfigKey): unknown => {
    const row = overrides.get(key)
    return row ? JSON.parse(row.value) as unknown : (hasDefault(key) ? (CONFIG_KEYS[key] as { default: unknown }).default : null)
  }
  const ids = CONFIG_KEY_NAMES.filter(holdsPeople).flatMap(key => (standing(key) as string[] | null) ?? [])
  const named = new Map(ids.length === 0
    ? []
    : (await db.all<{ id: string, name: string }>(sql`
        SELECT id, name FROM users WHERE id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))
      `)).map(user => [user.id, user.name]))

  return {
    settings: CONFIG_KEY_NAMES.map((key) => {
      const row = overrides.get(key)
      const definition = CONFIG_KEYS[key]
      return {
        key,
        workshop: definition.workshop,
        describes: definition.describes,
        default: hasDefault(key) ? (definition as { default: unknown }).default : null,
        hasDefault: hasDefault(key),
        value: row ? JSON.parse(row.value) as unknown : null,
        set: Boolean(row),
        // A rule the committee can record and the system does not yet enforce, said plainly (0012).
        enforced: isEnforced(key),
        sensitive: isSensitive(key),
        plannedFor: plannedFor(key),
        people: holdsPeople(key) ? ((standing(key) as string[] | null) ?? []).map(id => ({ id, name: named.get(id) ?? null })) : null,
        // Needs its own preview and a typed echo before it saves, and its own audited flag (J-105).
        wideBlastRadius: wideBlastRadius.has(key),
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.editorId ? { id: row.editorId, name: row.editorName } : null,
      }
    }),
  }
})
