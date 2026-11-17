// Secrets and credentials. A secret is a Worker secret set in the dashboard; a credential is a key
// entered in the app and stored encrypted in core_credentials with CORE_ENCRYPTION_KEY, for the
// module or for one of its records (a scope), falling back to a Worker secret of the same name.
// Neither is ever logged or returned to a browser. Special-category columns use the same key.
import { useContext } from './context'
import { useRegistry } from './registry'
import { nowMs } from './clock'
import type { RecordRef, UnitView } from './unit'

const IV_BYTES = 12 // not-policy: AES-GCM nonce length

async function key(): Promise<CryptoKey> {
  const secret = useContext().env.CORE_ENCRYPTION_KEY
  if (!secret) throw new Error('CORE_ENCRYPTION_KEY is not set. Add it as a Worker secret (any long random string).')
  const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0))

/** Encrypts a value for a special-category column or a stored credential. */
export async function seal(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(plain)))
  return `v1.${toBase64(iv)}.${toBase64(cipher)}`
}

export async function open(sealed: string): Promise<string> {
  const [version, iv, cipher] = sealed.split('.')
  if (version !== 'v1' || !iv || !cipher) throw new Error('Not a sealed value')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await key(), fromBase64(cipher))
  return new TextDecoder().decode(plain)
}

export const sealSpecial = (value: string | null) => value === null ? Promise.resolve(null) : seal(value)
export const openSpecial = (value: string | null) => value === null ? Promise.resolve(null) : open(value)
/** The same pair, for a column declared encrypted: true that is not special (a ticket's code kept to show again). */
export const sealColumn = sealSpecial
export const openColumn = openSpecial

function ownerOf(name: string) {
  const owner = [...useRegistry().modules.values()].find(m => m.manifest.secrets?.[name] || m.manifest.credentials?.[name])
  if (!owner) throw new Error(`"${name}" is not a declared secret or credential`)
  return owner.manifest
}

function workerSecret(name: string): string | null {
  const value = useContext().env[name]
  return typeof value === 'string' && value ? value : null
}

interface StoredRow { scope: string, ciphertext: string, hint: string | null, set_at: number, set_by: string | null }

/** The stored rows for a credential: the scope's own and the module-wide one ('' scope). */
async function storedRows(moduleId: string, name: string, scope: string): Promise<StoredRow[]> {
  const rows = await useContext().env.DB.prepare("SELECT scope, ciphertext, hint, set_at, set_by FROM core_credentials WHERE module_id = ? AND name = ? AND scope IN (?, '') ORDER BY scope DESC")
    .bind(moduleId, name, scope).all<StoredRow>()
  return rows.results ?? []
}

/**
 * Reads a secret or a credential the calling module declared. Null when it is not set.
 *
 * A credential is read from what an administrator saved in the app: for `scope` (a record, such as a
 * payment provider account) first, then the module-wide value. When neither is saved, a Worker
 * secret of the same name is used, so a key set in the Cloudflare dashboard keeps working.
 */
export async function credential(name: string, scope = ''): Promise<string | null> {
  const manifest = ownerOf(name)
  if (manifest.secrets?.[name]) return workerSecret(name)
  const [row] = await storedRows(manifest.id, name, scope)
  if (!row) return workerSecret(name)
  useContext().env.DB.prepare('UPDATE core_credentials SET last_used_at = ? WHERE module_id = ? AND name = ? AND scope = ?').bind(nowMs(), manifest.id, name, row.scope).run().catch(() => {})
  return open(row.ciphertext)
}

/** Where a credential's value comes from, for a screen. Never the value itself. */
export interface CredentialStatus {
  name: string
  /** Saved for this scope, saved for the whole module, a Worker secret, or not set. */
  source: 'saved' | 'saved-for-module' | 'worker-secret' | null
  /** The last four characters of a saved value. */
  hint: string | null
  setAt: number | null
  setBy: string | null
}

export async function credentialStatus(names: readonly string[], scope = ''): Promise<CredentialStatus[]> {
  const out: CredentialStatus[] = []
  for (const name of names) {
    const manifest = ownerOf(name)
    const [row] = manifest.credentials?.[name] ? await storedRows(manifest.id, name, scope) : []
    if (row) out.push({ name, source: row.scope === scope ? 'saved' : 'saved-for-module', hint: row.hint, setAt: row.set_at, setBy: row.set_by })
    else out.push({ name, source: workerSecret(name) ? 'worker-secret' : null, hint: null, setAt: null, setBy: null })
  }
  return out
}

// A hint shows the last four characters, and only of a value long enough that four give little away.
const HINT_CHARS = 4 // not-policy: the hint's length (Foundations, core_credentials)
const HINT_FROM = 16 // not-policy: shortest value that shows a hint

function credentialOf(name: string) {
  const manifest = ownerOf(name)
  if (!manifest.credentials?.[name]) throw new Error(`"${name}" is a Worker secret, set in the Cloudflare dashboard, not a credential`)
  return manifest
}

/**
 * Saves a credential typed by an administrator, encrypted, in the caller's unit of work. Audited
 * with its name and scope, against `record` when given, never its value. The value is never
 * returned to a browser.
 */
export async function setCredential(unit: UnitView, name: string, value: string, options: { scope?: string, by: string | null, record?: RecordRef }): Promise<void> {
  const manifest = credentialOf(name)
  const scope = options.scope ?? ''
  const at = nowMs()
  const hint = value.length >= HINT_FROM ? value.slice(-HINT_CHARS) : null
  unit.add({
    sql: `INSERT INTO core_credentials (module_id, name, scope, ciphertext, key_version, set_at, set_by, hint) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT (module_id, name, scope) DO UPDATE SET ciphertext = excluded.ciphertext, key_version = excluded.key_version, set_at = excluded.set_at, set_by = excluded.set_by, hint = excluded.hint, last_used_at = NULL`,
    params: [manifest.id, name, scope, await seal(value), at, options.by, hint],
  })
  unit.audit({ action: 'update', record: options.record, detail: { credential: name, ...(scope ? { scope } : {}) } })
}

/** Removes a saved credential. A Worker secret of the same name, if there is one, is used again. */
export function clearCredential(unit: UnitView, name: string, options: { scope?: string, record?: RecordRef } = {}): void {
  const manifest = credentialOf(name)
  const scope = options.scope ?? ''
  unit.add({ sql: 'DELETE FROM core_credentials WHERE module_id = ? AND name = ? AND scope = ?', params: [manifest.id, name, scope] })
  unit.audit({ action: 'delete', record: options.record, detail: { credential: name, ...(scope ? { scope } : {}) } })
}
