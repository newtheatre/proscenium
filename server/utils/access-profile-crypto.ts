import { decryptWithKey, encryptWithKey, importAccessProfileKey } from '#shared/utils/access-profile-crypto'
import type { EncryptedPayload } from '#shared/utils/access-profile-crypto'
import type { AccessProfilePayload } from '#shared/utils/access-profiles'

// The worker secret that unlocks `shared/utils/access-profile-crypto.ts`'s pure functions.
// Nothing else in this application touches `crypto.subtle` for this column (D-127, 0050).

let key: Promise<CryptoKey> | undefined

// Memoised per isolate, as `totpSecrets` and the session password are: importing a key is real
// work and the raw material never changes underneath a running worker.
async function encryptionKey(): Promise<CryptoKey> {
  const raw = useRuntimeConfig().accessProfileEncryptionKey
  if (!raw) {
    throw createError({ statusCode: 500, statusMessage: 'Access profile encryption is not configured' })
  }
  key ??= importAccessProfileKey(raw)
  return key
}

export async function encryptAccessProfilePayload(payload: AccessProfilePayload, userId: string): Promise<EncryptedPayload> {
  return encryptWithKey(payload, await encryptionKey(), userId)
}

export async function decryptAccessProfilePayload(encrypted: EncryptedPayload, userId: string): Promise<AccessProfilePayload> {
  return decryptWithKey(encrypted, await encryptionKey(), userId)
}
