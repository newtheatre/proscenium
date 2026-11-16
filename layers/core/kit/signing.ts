// The signing service (F-37). A module declares a purpose in its manifest (`signing: [{ purpose,
// rotateEvery, keepFor }]`) and signs short codes under it, so a device holding only the public keys
// can check a code with no connection. The kit owns the keys: ECDSA on P-256 with SHA-256, which both
// Workers and ordinary browsers offer through Web Crypto. A signature proves the theatre issued the
// code; it does not prove the thing the code stands for is still valid.
//
// Key states: `current` signs (one per purpose, by a unique index); `checking` only checks, for the
// purpose's keepFor after it stopped signing; `retired` checks nothing. The private part is sealed
// with CORE_ENCRYPTION_KEY, is never returned, logged or sent anywhere, and is erased as soon as the
// key stops signing. The public part is kept for ever.
import { useContext, useEnv } from './context'
import { useRegistry } from './registry'
import { seal, open } from './secrets'
import { newId } from './ids'
import { nowMs } from './clock'
import { parseDuration } from './duration'
import { Refusal } from './refusal'
import type { UnitView } from './unit'
import type { SigningDecl } from './manifest'

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGNATURE = { name: 'ECDSA', hash: 'SHA-256' } as const
const SECOND = 1000 // not-policy: milliseconds in a second

export type SigningKeyState = 'current' | 'checking' | 'retired'

/** One key a device may hold to check codes offline. */
export interface PublicSigningKey {
  keyId: string
  purpose: string
  /** 'ES256': ECDSA on P-256 with SHA-256; signatures are the 64-byte r||s form, base64url. */
  algorithm: 'ES256'
  /** The uncompressed point (65 bytes), base64url: importKey('raw', …, { name: 'ECDSA', namedCurve: 'P-256' }). */
  publicKey: string
  state: 'current' | 'checking'
  createdAt: number
  checkingFrom: number | null
  /** When it stops checking: null while it is current. */
  checksUntil: number | null
}

interface KeyRow {
  id: string
  purpose: string
  public_key: string
  private_key: string | null
  state: SigningKeyState
  created_at: number
  checking_from: number | null
  retired_at: number | null
}

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[\w-]*$/.test(text)) return null
  try {
    return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
  }
  catch {
    return null
  }
}
const asBytes = (data: Uint8Array | string): Uint8Array<ArrayBuffer> => typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)

// Imported keys, by key id, for this isolate. Private keys are imported non-extractable.
const privateKeys = new Map<string, Promise<CryptoKey>>()
const publicKeys = new Map<string, Promise<CryptoKey>>()

function declared(purpose: string): { module: string, decl: SigningDecl } {
  const found = useRegistry().signing.get(purpose)
  if (!found) throw new Error(`"${purpose}" is not a declared signing purpose. Declare it in the module's manifest: signing: [{ purpose, rotateEvery, keepFor }]`)
  // A route signs only under its own module's purposes; a module adding a kind of code to another
  // module's point signs through that point, so the host's code makes the call.
  const module = useContext().module
  if (module && module !== 'core' && module !== found.module) throw new Error(`${module} cannot sign under ${purpose}, which belongs to ${found.module}`)
  return found
}

/** Makes a key pair for a purpose: the row to insert, with the private part sealed. */
async function makeKey(purpose: string, at: number): Promise<{ sql: string, params: unknown[], id: string }> {
  const pair = await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']) as CryptoKeyPair
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer)
  const privateKey = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer)
  const id = newId('sgk', { at })
  return {
    id,
    sql: "INSERT INTO core_signing_keys (id, purpose, public_key, private_key, state, created_at) VALUES (?, ?, ?, ?, 'current', ?)",
    params: [id, purpose, toBase64Url(publicKey), await seal(toBase64Url(privateKey)), at],
  }
}

async function currentKey(purpose: string): Promise<KeyRow> {
  const db = useEnv().DB
  const select = () => db.prepare("SELECT * FROM core_signing_keys WHERE purpose = ? AND state = 'current'").bind(purpose).first<KeyRow>()
  const found = await select()
  if (found) return found
  // The first signature under a purpose makes its first key. Two instances racing both try; the
  // unique index keeps one and the other's insert does nothing.
  const made = await makeKey(purpose, nowMs())
  await db.prepare(`${made.sql} ON CONFLICT DO NOTHING`).bind(...made.params).run()
  const row = await select()
  if (!row) throw new Error(`No current signing key for ${purpose}`)
  return row
}

function privateKeyOf(row: KeyRow): Promise<CryptoKey> {
  let key = privateKeys.get(row.id)
  if (!key) {
    const sealed = row.private_key
    if (!sealed) throw new Error(`Signing key ${row.id} has no private part`)
    key = open(sealed).then(text => crypto.subtle.importKey('pkcs8', fromBase64Url(text)!, ALGORITHM, false, ['sign']))
    key.catch(() => privateKeys.delete(row.id))
    privateKeys.set(row.id, key)
  }
  return key
}

function publicKeyOf(row: Pick<KeyRow, 'id' | 'public_key'>): Promise<CryptoKey> {
  let key = publicKeys.get(row.id)
  if (!key) {
    key = crypto.subtle.importKey('raw', fromBase64Url(row.public_key)!, ALGORITHM, false, ['verify'])
    key.catch(() => publicKeys.delete(row.id))
    publicKeys.set(row.id, key)
  }
  return key
}

export const signing = {
  /**
   * Signs `data` with the purpose's current key. Text is signed as its UTF-8 bytes. When what is
   * signed must name the key (a door code is `<kind>.<key id>.<code>`), pass a function of the key
   * id instead, so the key named is the key that signs.
   */
  async sign(purpose: string, data: Uint8Array | string | ((keyId: string) => Uint8Array | string)): Promise<{ keyId: string, signature: string }> {
    declared(purpose)
    const row = await currentKey(purpose)
    const bytes = asBytes(typeof data === 'function' ? data(row.id) : data)
    const signature = new Uint8Array(await crypto.subtle.sign(SIGNATURE, await privateKeyOf(row), bytes))
    return { keyId: row.id, signature: toBase64Url(signature) }
  },

  /** True when `signature` is a signature of `data` by a key of this purpose that still checks. */
  async verify(purpose: string, keyId: string, data: Uint8Array | string, signature: string): Promise<boolean> {
    declared(purpose)
    if (typeof keyId !== 'string' || typeof signature !== 'string') return false
    const row = await useEnv().DB.prepare("SELECT id, public_key FROM core_signing_keys WHERE id = ? AND purpose = ? AND state IN ('current', 'checking')").bind(keyId, purpose).first<Pick<KeyRow, 'id' | 'public_key'>>()
    const bytes = fromBase64Url(signature)
    if (!row || !bytes || bytes.length !== 64) return false // not-policy: a P-256 signature is 64 bytes
    return crypto.subtle.verify(SIGNATURE, await publicKeyOf(row), bytes, asBytes(data))
  },

  /** Every key of the purpose that still checks, for a device to hold offline. */
  async publicKeys(purpose: string): Promise<PublicSigningKey[]> {
    const { decl } = declared(purpose)
    await currentKey(purpose)
    const keepFor = parseDuration(decl.keepFor) * SECOND
    const rows = await useEnv().DB.prepare("SELECT * FROM core_signing_keys WHERE purpose = ? AND state IN ('current', 'checking') ORDER BY created_at DESC").bind(purpose).all<KeyRow>()
    return rows.results.map(row => ({
      keyId: row.id,
      purpose,
      algorithm: 'ES256' as const,
      publicKey: row.public_key,
      state: row.state as 'current' | 'checking',
      createdAt: row.created_at,
      checkingFrom: row.checking_from,
      checksUntil: row.checking_from === null ? null : row.checking_from + keepFor,
    }))
  },
}

/** When the purpose's current key is due to be replaced, in UTC milliseconds. */
export function rotationDue(decl: SigningDecl, createdAt: number): number {
  return createdAt + parseDuration(decl.rotateEvery) * SECOND
}

/**
 * The scheduled rotation, in the task's unit of work. For each declared purpose: makes a current key
 * when there is none or the current one is due, moving the old one to checking only and erasing its
 * private part; retires a checking key once keepFor has passed since it stopped signing.
 */
export async function rotateSigningKeys(unit: UnitView): Promise<{ made: number, retired: number }> {
  const at = nowMs()
  const db = useEnv().DB
  let made = 0
  let retired = 0
  for (const [purpose, { decl }] of useRegistry().signing) {
    const rows = (await db.prepare("SELECT id, state, created_at, checking_from FROM core_signing_keys WHERE purpose = ? AND state IN ('current', 'checking')").bind(purpose).all<KeyRow>()).results
    const current = rows.find(r => r.state === 'current')
    if (!current || rotationDue(decl, current.created_at) <= at) {
      if (current) {
        unit.add({ sql: "UPDATE core_signing_keys SET state = 'checking', checking_from = ?, private_key = NULL WHERE id = ? AND state = 'current'", params: [at, current.id] })
        unit.audit({ action: 'update', record: ['core.signing-key', current.id], detail: { purpose, state: 'checking' } })
      }
      const key = await makeKey(purpose, at)
      unit.add({ sql: key.sql, params: key.params })
      unit.audit({ action: 'create', record: ['core.signing-key', key.id], detail: { purpose } })
      made++
    }
    const keepFor = parseDuration(decl.keepFor) * SECOND
    for (const row of rows) {
      if (row.state !== 'checking' || row.checking_from === null || row.checking_from + keepFor > at) continue
      unit.add({ sql: "UPDATE core_signing_keys SET state = 'retired', retired_at = ?, private_key = NULL WHERE id = ? AND state = 'checking'", params: [at, row.id] })
      unit.audit({ action: 'update', record: ['core.signing-key', row.id], detail: { purpose, state: 'retired' } })
      retired++
    }
  }
  return { made, retired }
}

/** What retiring a key at once would invalidate, in words for the person about to do it. */
export function retiringInvalidates(row: Pick<KeyRow, 'purpose' | 'state'>): string {
  const signing = row.state === 'current' ? ' A new key takes over signing straight away.' : ''
  return `Every code signed with this key under ${row.purpose} stops being accepted as genuine, at once and for good, including codes already handed out and those on door devices once they next refresh.${signing}`
}

/** A key's facts for the Health screen: never its private part, which is never read here. */
export async function listSigningKeys(): Promise<{ id: string, purpose: string, state: SigningKeyState, createdAt: number, checkingFrom: number | null, rotationDue: number | null, checksUntil: number | null, invalidates: string }[]> {
  const registry = useRegistry()
  const rows = (await useEnv().DB.prepare("SELECT id, purpose, state, created_at, checking_from FROM core_signing_keys WHERE state IN ('current', 'checking') ORDER BY purpose, created_at DESC").all<KeyRow>()).results
  return rows.map((row) => {
    const decl = registry.signing.get(row.purpose)?.decl
    return {
      id: row.id,
      purpose: row.purpose,
      state: row.state,
      createdAt: row.created_at,
      checkingFrom: row.checking_from,
      rotationDue: decl && row.state === 'current' ? rotationDue(decl, row.created_at) : null,
      checksUntil: decl && row.checking_from !== null ? row.checking_from + parseDuration(decl.keepFor) * SECOND : null,
      invalidates: retiringInvalidates(row),
    }
  })
}

/**
 * Retires a key at once (an Owner, from the Health screen): it stops checking and its private part
 * is erased. Without `confirm` it refuses, saying what it would invalidate. Retiring the current key
 * makes a new one in the same unit, so signing carries on.
 */
export async function retireSigningKey(unit: UnitView, id: string, options: { confirm?: boolean } = {}): Promise<{ id: string, state: 'retired', replacedBy?: string }> {
  const row = await useEnv().DB.prepare('SELECT id, purpose, state FROM core_signing_keys WHERE id = ?').bind(id).first<Pick<KeyRow, 'id' | 'purpose' | 'state'>>()
  if (!row || row.state === 'retired') throw new Refusal('core.not-found', 'There is no such signing key in use.', { status: 404 })
  if (options.confirm !== true) throw new Refusal('core.signing-key.confirm-needed', retiringInvalidates(row), { status: 422, remedy: 'Confirm to retire the key.', fields: { confirm: 'required' } })
  const at = nowMs()
  unit.add({ sql: "UPDATE core_signing_keys SET state = 'retired', retired_at = ?, private_key = NULL WHERE id = ? AND state = ?", params: [at, row.id, row.state] })
  unit.audit({ action: 'update', ability: 'core.signing-key.retire', record: ['core.signing-key', row.id], detail: { purpose: row.purpose, state: 'retired', was: row.state } })
  privateKeys.delete(row.id)
  publicKeys.delete(row.id)
  if (row.state !== 'current') return { id: row.id, state: 'retired' }
  const key = await makeKey(row.purpose, at)
  unit.add({ sql: key.sql, params: key.params })
  unit.audit({ action: 'create', record: ['core.signing-key', key.id], detail: { purpose: row.purpose } })
  return { id: row.id, state: 'retired', replacedBy: key.id }
}

/** Tests only: forget the imported keys, as a new isolate would. */
export function forgetImportedSigningKeys(): void {
  privateKeys.clear()
  publicKeys.clear()
}
