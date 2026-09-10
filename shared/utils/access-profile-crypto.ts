// Special category data is encrypted at rest with a per-worker key (D-127, 0011). AES-256-GCM:
// the tag catches tampering and a fresh IV every call means two identical profiles never match.

const ALGORITHM = 'AES-GCM'
const IV_BYTES = 12

function decodeKey(base64Key: string): Uint8Array {
  if (!base64Key) {
    throw new Error('access profile encryption key is not configured: set NUXT_ACCESS_PROFILE_ENCRYPTION_KEY')
  }
  const binary = atob(base64Key)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  if (bytes.length !== 32) {
    throw new Error(`access profile encryption key must decode to 32 bytes, got ${bytes.length}`)
  }
  return bytes
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', decodeKey(base64Key) as BufferSource, ALGORITHM, false, ['encrypt', 'decrypt'])
}

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

// Stored as base64(iv || ciphertext), one column, one round trip.
export async function encryptToStorage(base64Key: string, plaintext: unknown): Promise<string> {
  const key = await importKey(base64Key)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const encoded = new TextEncoder().encode(JSON.stringify(plaintext))
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: ALGORITHM, iv: iv as BufferSource }, key, encoded as BufferSource))
  const combined = new Uint8Array(iv.length + ciphertext.length)
  combined.set(iv, 0)
  combined.set(ciphertext, iv.length)
  return toBase64(combined)
}

// Throws on a wrong key or a tampered value: GCM's authentication tag refuses to decrypt rather
// than returning corrupted plaintext.
export async function decryptFromStorage<T>(base64Key: string, stored: string): Promise<T> {
  const key = await importKey(base64Key)
  const combined = fromBase64(stored)
  const iv = combined.slice(0, IV_BYTES)
  const ciphertext = combined.slice(IV_BYTES)
  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv: iv as BufferSource }, key, ciphertext as BufferSource)
  return JSON.parse(new TextDecoder().decode(decrypted)) as T
}
