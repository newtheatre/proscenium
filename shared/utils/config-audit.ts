import { isRecordable } from './audit'
import { isSensitive } from './config'
import type { AuditDetail } from './audit'
import type { ConfigKey } from './config'

// What a settings change records. A value that could carry personal data, or that the guard would
// refuse, is hashed instead: provable later, never held in the log (0011, 0024).

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export async function configChangeDetail(key: ConfigKey, from: unknown, to: unknown): Promise<AuditDetail> {
  const plain: AuditDetail = { key, from: from ?? null, to }

  if (!isSensitive(key) && isRecordable(plain)) return plain

  return { key, redacted: true, fromHash: await digest(from), toHash: await digest(to) }
}
