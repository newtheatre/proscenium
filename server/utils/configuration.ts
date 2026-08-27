import { CONFIG_KEYS, hasDefault } from '#shared/utils/config'
import type { ConfigKey } from '#shared/utils/config'
import type { PasswordPolicy } from '#shared/utils/auth'
import type { H3Event } from 'h3'
import type { z } from 'zod'

export type ConfigValue<K extends ConfigKey> = z.infer<(typeof CONFIG_KEYS)[K]['schema']>

const CONTEXT_KEY = '__nntConfig'

async function readOverrides(): Promise<Map<string, unknown>> {
  const rows = await db.select({ key: schema.config.key, value: schema.config.value }).from(schema.config)
  return new Map(rows.map(row => [row.key, JSON.parse(row.value) as unknown]))
}

// Memoised per request, never per isolate: an isolate-scoped cache would hold a stale value until
// the isolate recycled, and a settings change has to take effect on the next request (0012).
function overrides(event?: H3Event): Promise<Map<string, unknown>> {
  if (!event) return readOverrides()

  const context = event.context as Record<string, unknown>
  const cached = context[CONTEXT_KEY] as Promise<Map<string, unknown>> | undefined
  if (cached) return cached

  const loading = readOverrides()
  context[CONTEXT_KEY] = loading
  return loading
}

// The enforced value of a key: its override, or the default it ships with. A key the workshop
// register proposed no value for has neither, and reading one is a defect (0019).
export async function configValue<K extends ConfigKey>(event: H3Event | undefined, key: K): Promise<ConfigValue<K>> {
  const set = await overrides(event)
  if (set.has(key)) return set.get(key) as ConfigValue<K>

  if (!hasDefault(key)) {
    throw createError({
      statusCode: 503,
      statusMessage: `${key} has not been set yet, so the feature that needs it cannot run`,
    })
  }

  return (CONFIG_KEYS[key] as { default: unknown }).default as ConfigValue<K>
}

// Five keys, one query: the overrides are already loaded by the time the second await runs.
export async function passwordPolicy(event?: H3Event): Promise<PasswordPolicy> {
  return {
    minLength: await configValue(event, 'PASSWORD_MIN_LENGTH'),
    maxLength: await configValue(event, 'PASSWORD_MAX_LENGTH'),
    requireMixedCase: await configValue(event, 'PASSWORD_REQUIRE_MIXED_CASE'),
    requireNumber: await configValue(event, 'PASSWORD_REQUIRE_NUMBER'),
    requireSymbol: await configValue(event, 'PASSWORD_REQUIRE_SYMBOL'),
  }
}
