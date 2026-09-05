import { describe, expect, test } from 'bun:test'
import { decryptWithKey, encryptWithKey, importAccessProfileKey } from '#shared/utils/access-profile-crypto'
import type { AccessProfilePayload } from '#shared/utils/access-profiles'

// AES-256-GCM round trips, and what it refuses (0050). The runtime-config-reading wrappers are
// exercised by the e2e suite, which is where a live worker secret exists.

async function testKey(): Promise<CryptoKey> {
  const raw = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
  return importAccessProfileKey(raw)
}

const OWNER = 'u-owner'
const SOMEBODY_ELSE = 'u-somebody-else'

const payload: AccessProfilePayload = {
  flags: {
    standing: true,
    crowds: false,
    levelAccess: true,
    distance: false,
    urgentToilet: false,
    essentialCompanion: false,
    visualInformation: false,
    audibleInformation: false,
    other: false,
  },
  requesterNote: 'Uses a mobility aid',
  fohNote: null,
  accessCardNumber: 'NAC1234567',
}

describe('access profile encryption (D-127, 0050)', () => {
  test('round trips exactly', async () => {
    const key = await testKey()
    const encrypted = await encryptWithKey(payload, key, OWNER)
    expect(await decryptWithKey(encrypted, key, OWNER)).toEqual(payload)
  })

  test('two writes of the same payload use different nonces and different ciphertext', async () => {
    const key = await testKey()
    const first = await encryptWithKey(payload, key, OWNER)
    const second = await encryptWithKey(payload, key, OWNER)
    expect(first.iv).not.toBe(second.iv)
    expect(first.ciphertext).not.toBe(second.ciphertext)
  })

  test('the wrong key cannot decrypt it', async () => {
    const encrypted = await encryptWithKey(payload, await testKey(), OWNER)
    await expect(decryptWithKey(encrypted, await testKey(), OWNER)).rejects.toThrow()
  })

  test('a tampered ciphertext is refused, not silently misread', async () => {
    const key = await testKey()
    const encrypted = await encryptWithKey(payload, key, OWNER)
    const bytes = Buffer.from(encrypted.ciphertext, 'base64')
    bytes[0] = (bytes[0]! + 1) % 256
    await expect(decryptWithKey({ ...encrypted, ciphertext: bytes.toString('base64') }, key, OWNER)).rejects.toThrow()
  })

  // The account id is bound in as associated data, so a ciphertext copied onto another row
  // (a migration slip, a bad script) is refused rather than silently read as that row's own.
  test('a ciphertext bound to one account will not decrypt under another', async () => {
    const key = await testKey()
    const encrypted = await encryptWithKey(payload, key, OWNER)
    await expect(decryptWithKey(encrypted, key, SOMEBODY_ELSE)).rejects.toThrow()
  })
})
