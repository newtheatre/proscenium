// A software passkey for integration tests: it makes and proves credentials the way a phone or a
// laptop would (attestation "none", ES256, user verified), so the real verifier checks real bytes.
import { isoCBOR } from '@simplewebauthn/server/helpers'

const enc = new TextEncoder()
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)), c => c.charCodeAt(0))
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
const sha256 = async (data: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', data))
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])

/** WebCrypto signs ECDSA as raw r||s; WebAuthn wants DER. */
function derSignature(raw: Uint8Array): Uint8Array {
  const integer = (bytes: Uint8Array) => {
    let i = 0
    while (i < bytes.length - 1 && bytes[i] === 0) i++
    let v = bytes.slice(i)
    if (v[0]! & 0x80) v = concat(new Uint8Array([0]), v)
    return concat(new Uint8Array([0x02, v.length]), v)
  }
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)))
  return concat(new Uint8Array([0x30, body.length]), body)
}

interface Credential { id: Uint8Array, keys: CryptoKeyPair, userHandle: string, counter: number }

export class Authenticator {
  readonly credentials: Credential[] = []
  constructor(readonly origin = 'https://test', readonly rpId = 'test') {}

  /** navigator.credentials.create(), returning what @simplewebauthn/browser would send. */
  async create(options: { challenge: string, user: { id: string } }) {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
    const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey)
    const id = crypto.getRandomValues(new Uint8Array(32))
    this.credentials.push({ id, keys, userHandle: options.user.id, counter: 0 })
    const cose = isoCBOR.encode(new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, unb64(jwk.x!)], [-3, unb64(jwk.y!)]]) as any)
    const authData = concat(await sha256(enc.encode(this.rpId)), new Uint8Array([0x45]), u32(0), new Uint8Array(16), new Uint8Array([0, id.length]), id, cose)
    const attestationObject = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]) as any)
    const clientDataJSON = enc.encode(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: this.origin, crossOrigin: false }))
    return {
      id: b64(id), rawId: b64(id), type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
      response: { clientDataJSON: b64(clientDataJSON), attestationObject: b64(attestationObject), transports: ['internal'] },
    }
  }

  /** navigator.credentials.get(): proves the given credential, or the first allowed, or the first held. */
  async get(options: { challenge: string, allowCredentials?: { id: string }[] }, which?: number) {
    const allowed = options.allowCredentials?.map(c => c.id) ?? []
    const credential = which !== undefined ? this.credentials[which]! : this.credentials.find(c => !allowed.length || allowed.includes(b64(c.id)))
    if (!credential) throw new Error('This authenticator holds no allowed credential')
    credential.counter++
    const authData = concat(await sha256(enc.encode(this.rpId)), new Uint8Array([0x05]), u32(credential.counter))
    const clientDataJSON = enc.encode(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: this.origin, crossOrigin: false }))
    const raw = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, credential.keys.privateKey, concat(authData, await sha256(clientDataJSON))))
    return {
      id: b64(credential.id), rawId: b64(credential.id), type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
      response: { clientDataJSON: b64(clientDataJSON), authenticatorData: b64(authData), signature: b64(derSignature(raw)), userHandle: credential.userHandle },
    }
  }
}
