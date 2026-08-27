import { z } from 'zod'
import { CONFIG_KEYS, hasDefault, isConfigKey } from '#shared/utils/config'
import { configChangeDetail } from '#shared/utils/config-audit'
import { configProblem } from '#shared/utils/config-rules'
import type { ConfigKey } from '#shared/utils/config'

const body = z.object({ value: z.unknown() })

// Change one setting. One key per request, so one save is one audited change.
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'config.write')
  const key = getRouterParam(event, 'key') ?? ''

  if (!isConfigKey(key)) {
    throw createError({ statusCode: 404, statusMessage: 'No such setting' })
  }

  // Arming retention would arm nothing: there is no sweep and no reviewed dry-run digest, so the
  // switch would read as done while doing nothing (J-105 criterion 4, K-111).
  if (key === 'RETENTION_ARMED') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Retention cannot be armed until the sweep exists and a dry-run digest has been reviewed',
    })
  }

  const input = await readValidatedBodyOrThrow(event, body)

  // The pair rules compare against the other keys as they stand, so the set is read first.
  const overrides = await configOverrides(event)
  const problem = configProblem(key, input.value, other => currentValue(other, overrides))
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })

  const from = overrides.has(key) ? overrides.get(key) : (hasDefault(key) ? (CONFIG_KEYS[key] as { default: unknown }).default : null)
  const now = Math.floor(Date.now() / 1000)

  await db.batch([
    db.insert(schema.config)
      .values({ key, value: JSON.stringify(input.value), updatedBy: resolved.account.id, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.config.key,
        set: { value: JSON.stringify(input.value), updatedBy: resolved.account.id, updatedAt: now },
      }),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'config.changed',
      target: `config:${key}`,
      detail: await configChangeDetail(key, from, input.value),
    })),
  ])

  return { ok: true, key, value: input.value }
})

function currentValue(key: ConfigKey, overrides: Map<string, unknown>): unknown {
  if (overrides.has(key)) return overrides.get(key)
  return hasDefault(key) ? (CONFIG_KEYS[key] as { default: unknown }).default : undefined
}
