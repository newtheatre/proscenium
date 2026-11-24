// Secrets and credentials. A secret is a Worker secret set in the dashboard; a credential is a key
// entered in the app and stored encrypted in core_credentials with CORE_ENCRYPTION_KEY, for the
// module or for one of its records (a scope). A credential is never read from the Worker (Matt, 19
// November: nothing the site can hold is set on the Worker). Neither is ever logged or returned to a
// browser. Special-category columns use the same key.
import { isPractice } from './practice/gate'
import { useContext } from './context'
import { useRegistry } from './registry'
import { nowMs } from './clock'
import { createUnit } from './unit'
import { log } from './log'
import { changeSetting } from './settings-store'
import type { RecordRef, UnitView } from './unit'
import type { CredentialDecl } from './manifest'

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
 * payment provider account) first, then the module-wide value.
 */
export async function credential(name: string, scope = ''): Promise<string | null> {
  const manifest = ownerOf(name)
  // No provider key, token or webhook secret reaches practice code (Practice mode, part 2).
  if (isPractice()) return null
  if (manifest.secrets?.[name]) return workerSecret(name)
  const [row] = await storedRows(manifest.id, name, scope)
  if (!row) return null
  useContext().env.DB.prepare('UPDATE core_credentials SET last_used_at = ? WHERE module_id = ? AND name = ? AND scope = ?').bind(nowMs(), manifest.id, name, row.scope).run().catch(() => {})
  return open(row.ciphertext)
}

/** Where a credential's value comes from, for a screen. Never the value itself. */
export interface CredentialStatus {
  name: string
  /** Saved for this scope, saved for the whole module, or not set. */
  source: 'saved' | 'saved-for-module' | null
  /** The last four characters of a long value. */
  hint: string | null
  /** A long value's provider prefix (`sk_live_`, `whsec_`), so a screen can tell live from test. */
  start: string | null
  setAt: number | null
  setBy: string | null
}

export async function credentialStatus(names: readonly string[], scope = ''): Promise<CredentialStatus[]> {
  const out: CredentialStatus[] = []
  for (const name of names) {
    const manifest = ownerOf(name)
    const [row] = manifest.credentials?.[name] ? await storedRows(manifest.id, name, scope) : []
    if (row) out.push({ name, source: row.scope === scope ? 'saved' : 'saved-for-module', ...splitHint(row.hint), setAt: row.set_at, setBy: row.set_by })
    else out.push({ name, source: null, hint: null, start: null, setAt: null, setBy: null })
  }
  return out
}

// A hint shows the last four characters, and only of a value long enough that four give little away.
// A longer one also shows its provider's prefix, such as sk_live_ or whsec_, which says what kind of
// key it is and nothing of the secret part (Matt, 17 November: make a saved key obvious at a glance).
// Both are kept in the hint column as <start>…<end>; a hint saved before has the end alone.
const HINT_CHARS = 4 // not-policy: the hint's length (Foundations, core_credentials)
const HINT_FROM = 16 // not-policy: shortest value that shows a hint
const START_FROM = 24 // not-policy: shortest value that also shows its prefix
const PREFIX = /^[A-Za-z]{2,6}[_-](?:(?:live|test)[_-])?/ // not-policy: a provider's key prefix, such as sk_live_ or whsec_
const SPLIT = '…'

function hintOf(value: string): string | null {
  if (value.length < HINT_FROM) return null
  const prefix = value.length >= START_FROM ? value.match(PREFIX)?.[0] ?? '' : ''
  return `${prefix}${SPLIT}${value.slice(-HINT_CHARS)}`
}

function splitHint(stored: string | null): { hint: string | null, start: string | null } {
  if (!stored) return { hint: null, start: null }
  const at = stored.lastIndexOf(SPLIT)
  return at < 0 ? { hint: stored, start: null } : { hint: stored.slice(at + 1) || null, start: stored.slice(0, at) || null }
}

/** A declared credential and the module that owns it, or null for a name that is not one. */
export function credentialEntry(name: string): { module: string, decl: CredentialDecl } | null {
  for (const m of useRegistry().modules.values()) {
    const decl = m.manifest.credentials?.[name]
    if (decl) return { module: m.manifest.id, decl }
  }
  return null
}

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
  const hint = hintOf(value)
  unit.add({
    sql: `INSERT INTO core_credentials (module_id, name, scope, ciphertext, key_version, set_at, set_by, hint) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT (module_id, name, scope) DO UPDATE SET ciphertext = excluded.ciphertext, key_version = excluded.key_version, set_at = excluded.set_at, set_by = excluded.set_by, hint = excluded.hint, last_used_at = NULL`,
    params: [manifest.id, name, scope, await seal(value), at, options.by, hint],
  })
  unit.audit({ action: 'update', record: options.record, detail: { credential: name, ...(scope ? { scope } : {}) } })
}

/** Removes a saved credential. Anything that reads it then finds it unset. */
export function clearCredential(unit: UnitView, name: string, options: { scope?: string, record?: RecordRef } = {}): void {
  const manifest = credentialOf(name)
  const scope = options.scope ?? ''
  unit.add({ sql: 'DELETE FROM core_credentials WHERE module_id = ? AND name = ? AND scope = ?', params: [manifest.id, name, scope] })
  unit.audit({ action: 'delete', record: options.record, detail: { credential: name, ...(scope ? { scope } : {}) } })
}

/**
 * Moves keys that a site set up before 19 November still holds on the Worker into the app, from the
 * minute's cron tick. A credential is saved for the whole module, audited by name, and the Turnstile
 * site key goes into its public setting; each only while it has never been saved, changed or removed
 * in the app, so what an administrator did there always stands. The Worker copies are then never read
 * and can be deleted. Answers the names it moved. Costs nothing once no Worker copy is left.
 */
export async function adoptWorkerSecrets(): Promise<string[]> {
  const { DB } = useContext().env
  const moved: string[] = []
  for (const m of useRegistry().modules.values()) {
    for (const name of Object.keys(m.manifest.credentials ?? {})) {
      const value = workerSecret(name)
      if (!value) continue
      const touched = await DB.prepare("SELECT 1 FROM core_credentials WHERE module_id = ? AND name = ? AND scope = '' UNION ALL SELECT 1 FROM core_audit WHERE json_extract(detail, '$.credential') = ? LIMIT 1")
        .bind(m.manifest.id, name, name).first()
      if (touched) continue
      const unit = createUnit()
      unit.add({
        sql: "INSERT INTO core_credentials (module_id, name, scope, ciphertext, key_version, set_at, set_by, hint) VALUES (?, ?, '', ?, 1, ?, NULL, ?) ON CONFLICT (module_id, name, scope) DO NOTHING",
        params: [m.manifest.id, name, await seal(value), nowMs(), hintOf(value)],
      })
      unit.audit({ action: 'update', detail: { credential: name, from: 'worker-secret' } })
      await unit.commit()
      moved.push(name)
    }
  }
  const siteKey = workerSecret(TURNSTILE_SITE_KEY_VARIABLE)
  if (siteKey && !(await DB.prepare('SELECT 1 FROM core_setting_changes WHERE key = ? LIMIT 1').bind(TURNSTILE_SITE_KEY_SETTING).first())) {
    const unit = createUnit()
    await changeSetting(unit.view(), TURNSTILE_SITE_KEY_SETTING, siteKey, { reason: `Moved from the Worker variable ${TURNSTILE_SITE_KEY_VARIABLE}` })
    await unit.commit()
    moved.push(TURNSTILE_SITE_KEY_VARIABLE)
  }
  if (moved.length) log.info('core.credentials.moved-from-worker', { names: moved })
  return moved
}

const TURNSTILE_SITE_KEY_VARIABLE = 'NUXT_PUBLIC_TURNSTILE_SITE_KEY'
const TURNSTILE_SITE_KEY_SETTING = 'core.sign-in.turnstile-site-key'
