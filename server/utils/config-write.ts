import { db, schema } from '@nuxthub/db'
import { and, desc, eq, sql } from 'drizzle-orm'
// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (CONTRIBUTING, 0055).
import { createError } from 'h3'
import { CONFIG_KEYS, hasDefault } from '#shared/utils/config'
import { auditEntry } from '#shared/utils/audit'
import { configChangeDetail } from '#shared/utils/config-audit'
import { configProblem } from '#shared/utils/config-rules'
import { configOverrides } from './configuration'
import { hasSentRetentionDigest } from './retention-candidates'
import type { ConfigKey } from '#shared/utils/config'
import type { H3Event } from 'h3'

// A save and a revert are one write path (J-105 criterion 3), so a revert cannot bypass what
// the digest gate and the pair rules already ask of a save.

export function currentValue(key: ConfigKey, overrides: Map<string, unknown>): unknown {
  if (overrides.has(key)) return overrides.get(key)
  return hasDefault(key) ? (CONFIG_KEYS[key] as { default: unknown }).default : undefined
}

export async function writeConfigValue(event: H3Event, actorId: string, key: ConfigKey, value: unknown): Promise<void> {
  // Whether a digest was actually reviewed is nobody's to verify in code; that at least one
  // exists to have been read is (J-105 criterion 4, K-111).
  if (key === 'RETENTION_ARMED' && value === true && !await hasSentRetentionDigest()) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Retention cannot be armed until a dry-run digest has gone out to review',
    })
  }

  const overrides = await configOverrides(event)
  const problem = configProblem(key, value, other => currentValue(other, overrides))
  if (problem) throw createError({ statusCode: 400, statusMessage: problem })

  const from = currentValue(key, overrides)
  const now = Math.floor(Date.now() / 1000)

  await db.batch([
    db.insert(schema.config)
      .values({ key, value: JSON.stringify(value), updatedBy: actorId, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.config.key,
        set: { value: JSON.stringify(value), updatedBy: actorId, updatedAt: now },
      }),
    db.insert(schema.auditLog).values(auditEntry({
      actorId,
      action: 'config.changed',
      target: `config:${key}`,
      detail: await configChangeDetail(key, from, value),
    })),
  ])
}

export interface ConfigChangeDetail { changes?: { value?: { from: unknown } }, redacted?: true }

// Null for a sensitive key: its detail is a hash pair (0024), and a hash cannot be reverted to.
// Exported and pure, so the parsing is proved without a database (J-105 criterion 3).
export function priorValueFromDetail(detail: ConfigChangeDetail | null | undefined): { value: unknown } | null {
  if (!detail?.changes?.value || detail.redacted) return null
  return { value: detail.changes.value.from }
}

// The value a key stood at immediately before its own last change, read back from the trail
// rather than a second history table the audit log already is (J-105 criterion 3).
export async function priorConfigValue(key: ConfigKey): Promise<{ value: unknown } | null> {
  // rowid breaks a tie within the same second, the insertion-order proxy bar.ts's own
  // effective-price lookups already lean on for the identical reason.
  const [row] = await db.select({ detail: schema.auditLog.detail })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, 'config.changed'), eq(schema.auditLog.target, `config:${key}`)))
    .orderBy(desc(schema.auditLog.createdAt), desc(sql`rowid`))
    .limit(1)

  return priorValueFromDetail(row?.detail as ConfigChangeDetail | undefined)
}
