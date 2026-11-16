// Secrets and credentials. A secret is a Worker secret set in the dashboard; a credential is a key
// entered in the console and stored encrypted in core_credentials with CORE_ENCRYPTION_KEY. Neither
// is ever logged or returned to a browser. Special-category columns use the same key.
import { useContext } from './context'
import { useRegistry } from './registry'
import { nowMs } from './clock'

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

/** Reads a secret or a stored credential the calling module declared. Null when it is not set. */
export async function credential(name: string): Promise<string | null> {
  const registry = useRegistry()
  const owner = [...registry.modules.values()].find(m => m.manifest.secrets?.[name] || m.manifest.credentials?.[name])
  if (!owner) throw new Error(`"${name}" is not a declared secret or credential`)
  const context = useContext()
  if (owner.manifest.secrets?.[name]) {
    const value = context.env[name]
    return typeof value === 'string' && value ? value : null
  }
  const row = await context.env.DB.prepare('SELECT ciphertext FROM core_credentials WHERE module_id = ? AND name = ?').bind(owner.manifest.id, name).first<{ ciphertext: string }>()
  if (!row) return null
  context.env.DB.prepare('UPDATE core_credentials SET last_used_at = ? WHERE module_id = ? AND name = ?').bind(nowMs(), owner.manifest.id, name).run().catch(() => {})
  return open(row.ciphertext)
}
