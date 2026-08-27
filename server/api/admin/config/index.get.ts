import { eq } from 'drizzle-orm'
import { CONFIG_KEYS, CONFIG_KEY_NAMES, hasDefault, isEnforced, isSensitive } from '#shared/utils/config'

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
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.editorId ? { id: row.editorId, name: row.editorName } : null,
      }
    }),
  }
})
