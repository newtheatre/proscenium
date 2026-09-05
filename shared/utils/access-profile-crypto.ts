import type { AccessProfilePayload } from './access-profiles'

// AES-256-GCM on Web Crypto (D-127, 0050). Pure, taking an imported key rather than reading
// configuration; `server/utils/access-profile-crypto.ts` reads the worker secret and calls this.

const ALGORITHM = 'AES-GCM'
const IV_BYTES = 12

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export interface EncryptedPayload {
  ciphertext: string
  iv: string
}

// Bound in as GCM's associated data rather than encrypted, so a ciphertext copied onto another
// account's row (a migration slip, a bad script) refuses rather than decrypting as that row's own.
function aadFor(userId: string): BufferSource {
  return new TextEncoder().encode(userId) as BufferSource
}

// A fresh nonce every write: AES-GCM is broken outright by reusing one under the same key.
export async function encryptWithKey(payload: AccessProfilePayload, key: CryptoKey, userId: string): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plaintext = new TextEncoder().encode(JSON.stringify(payload))
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv as BufferSource, additionalData: aadFor(userId) },
    key,
    plaintext as BufferSource,
  )
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) }
}

export async function decryptWithKey(encrypted: EncryptedPayload, key: CryptoKey, userId: string): Promise<AccessProfilePayload> {
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: fromBase64(encrypted.iv) as BufferSource, additionalData: aadFor(userId) },
    key,
    fromBase64(encrypted.ciphertext) as BufferSource,
  )
  return JSON.parse(new TextDecoder().decode(decrypted)) as AccessProfilePayload
}

export async function importAccessProfileKey(base64Key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64(base64Key) as BufferSource, ALGORITHM, false, ['encrypt', 'decrypt'])
}
