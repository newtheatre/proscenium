// F-37: the kit's signing service. A module that declares a purpose signs and verifies under it;
// publicKeys gives what a device needs to check offline; the daily task rotates and retires keys,
// erasing private parts; an Owner can retire a key at once after being told what it invalidates; and
// no private key leaves core_signing_keys, where it is sealed.
import { afterEach, describe, expect, it } from 'vitest'
import { createUnit } from '#kit'
import { signing, forgetImportedSigningKeys } from '#kit/signing'
import { setClock, advanceClock } from '#kit/clock'
import { resetRateLimits } from '#kit/ratelimit'
import rotate from '../../layers/core/server/tasks/rotate-signing-keys'
import healthCheck from '../../layers/core/server/contributions/core.health-check/signing-keys'
import listKeys from '../../layers/core/server/api/core/signing-keys.get'
import retire from '../../layers/core/server/api/core/signing-keys/[id]/retire.post'
import { call, env, inContext, person, rows, server } from './helpers'

const PURPOSE = 'seats.door-code'
const DAY = 86_400_000 // not-policy: a day in milliseconds
const handle = server({
  'GET /api/core/signing-keys': listKeys,
  'POST /api/core/signing-keys/:id/retire': retire,
})

const runRotation = () => inContext(async () => {
  const unit = createUnit()
  await rotate(unit.view(), { dueAt: Date.now() })
  await unit.commit()
})
const keys = () => rows<{ id: string, state: string, private_key: string | null, public_key: string, checking_from: number | null, retired_at: number | null }>('SELECT * FROM core_signing_keys WHERE purpose = ? ORDER BY created_at', PURPOSE)

afterEach(async () => {
  setClock(undefined)
  resetRateLimits()
  forgetImportedSigningKeys()
  await env.DB.prepare('DELETE FROM core_signing_keys').run()
})

describe('the signing service (F-37)', () => {
  it('signs under a declared purpose and verifies the signature, and nothing altered', async () => {
    const code = 'tkt.abc.4m2q7xk3'
    const { keyId, signature } = await inContext(() => signing.sign(PURPOSE, code))
    expect(keyId).toMatch(/^sgk_[2-7a-z]{26}$/)
    expect(signature).toMatch(/^[\w-]{86}$/) // not-policy: 64 bytes in base64url
    expect(await inContext(() => signing.verify(PURPOSE, keyId, code, signature))).toBe(true)
    expect(await inContext(() => signing.verify(PURPOSE, keyId, `${code}x`, signature))).toBe(false)
    expect(await inContext(() => signing.verify(PURPOSE, keyId, code, `${signature.slice(0, -2)}AA`))).toBe(false)
    expect(await inContext(() => signing.verify(PURPOSE, keyId, code, 'not a signature'))).toBe(false)
    expect(await inContext(() => signing.verify(PURPOSE, 'sgk_aaaaaaaaaaaaaaaaaaaaaaaaaa', code, signature))).toBe(false)
  })

  it('signs text that names the key that signs it, as a door code does', async () => {
    const { keyId, signature } = await inContext(() => signing.sign(PURPOSE, id => `tkt.${id}.4m2q7xk3`))
    expect(await inContext(() => signing.verify(PURPOSE, keyId, `tkt.${keyId}.4m2q7xk3`, signature))).toBe(true)
  })

  it('refuses a purpose nobody declared', async () => {
    await expect(inContext(() => signing.sign('seats.unknown', 'x'))).rejects.toThrow(/not a declared signing purpose/)
  })

  it('keeps the private part sealed in the table and never hands it out', async () => {
    const code = 'tkt.abc.seal'
    await inContext(() => signing.sign(PURPOSE, code))
    const [row] = await keys()
    expect(row!.private_key).toMatch(/^v1\./) // sealed with CORE_ENCRYPTION_KEY
    const published = await inContext(() => signing.publicKeys(PURPOSE))
    expect(JSON.stringify(published)).not.toContain(row!.private_key!.slice(3, 40))
    expect(Object.keys(published[0]!).sort()).toEqual(['algorithm', 'checkingFrom', 'checksUntil', 'createdAt', 'keyId', 'publicKey', 'purpose', 'state'])
    const listed = await call(handle, 'GET', '/api/core/signing-keys', { actor: person(['core.health.view']) })
    expect(JSON.stringify(await listed.json())).not.toMatch(/private|v1\./)
  })

  it('gives public keys a browser can check a signature with, offline', async () => {
    const code = 'tkt.abc.offline'
    const { keyId, signature } = await inContext(() => signing.sign(PURPOSE, code))
    const [published] = await inContext(() => signing.publicKeys(PURPOSE))
    expect(published).toMatchObject({ keyId, purpose: PURPOSE, algorithm: 'ES256', state: 'current', checksUntil: null })
    // What a device does with no connection: plain Web Crypto, nothing of the kit's.
    const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', b64(published!.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64(signature), new TextEncoder().encode(code))).toBe(true)
  })

  it('rotates a key when it is due, keeps the old one for checking, then retires it and erases its private part', async () => {
    setClock(Date.UTC(2026, 10, 16, 3, 30))
    const code = 'tkt.abc.rotate'
    const first = await inContext(() => signing.sign(PURPOSE, code))

    await runRotation() // not yet due
    expect((await keys()).map(k => k.state)).toEqual(['current'])

    advanceClock(90 * DAY) // rotateEvery
    await runRotation()
    const [old, current] = await keys()
    expect([old!.state, current!.state]).toEqual(['checking', 'current'])
    expect(old!.private_key).toBeNull()
    // The old key still checks what it signed; new codes are signed by the new key.
    expect(await inContext(() => signing.verify(PURPOSE, first.keyId, code, first.signature))).toBe(true)
    expect((await inContext(() => signing.sign(PURPOSE, code))).keyId).toBe(current!.id)
    expect((await inContext(() => signing.publicKeys(PURPOSE))).map(k => k.keyId)).toEqual([current!.id, old!.id])

    advanceClock(365 * DAY - 1) // keepFor, less a moment
    await runRotation()
    expect((await keys()).find(k => k.id === old!.id)!.state).toBe('checking')
    advanceClock(1)
    await runRotation()
    const retired = (await keys()).find(k => k.id === old!.id)!
    expect(retired).toMatchObject({ state: 'retired', private_key: null })
    expect(retired.public_key).toBeTruthy() // kept for ever
    expect(await inContext(() => signing.verify(PURPOSE, first.keyId, code, first.signature))).toBe(false)
    expect((await inContext(() => signing.publicKeys(PURPOSE))).map(k => k.keyId)).not.toContain(old!.id)

    const audited = await rows<{ action: string, record_id: string }>("SELECT action, record_id FROM core_audit WHERE record_type = 'core.signing-key' AND record_id = ?", old!.id)
    expect(audited.length).toBeGreaterThanOrEqual(2)
  })

  it('makes the first key for a declared purpose from the daily task, before anything is signed', async () => {
    await runRotation()
    expect((await keys()).map(k => k.state)).toEqual(['current'])
  })

  it('lets an Owner retire a key at once, only after being told what it invalidates', async () => {
    const code = 'tkt.abc.retire'
    const signed = await inContext(() => signing.sign(PURPOSE, code))
    const owner = person(['core.signing-key.retire'])

    const refused = await call(handle, 'POST', `/api/core/signing-keys/${signed.keyId}/retire`, { actor: person(['core.health.view']), body: {} })
    expect(refused.status).toBe(403)

    const warned = await call(handle, 'POST', `/api/core/signing-keys/${signed.keyId}/retire`, { actor: owner, body: {} })
    expect(warned.status).toBe(422)
    const warning = await warned.json() as { code: string, reason: string }
    expect(warning.code).toBe('core.signing-key.confirm-needed')
    expect(warning.reason).toMatch(/Every code signed with this key under seats\.door-code stops being accepted/)
    expect((await keys())[0]!.state).toBe('current')

    const listed = await (await call(handle, 'GET', '/api/core/signing-keys', { actor: owner })).json() as { keys: { id: string, invalidates: string }[] }
    expect(listed.keys[0]!.invalidates).toBe(warning.reason)

    const done = await call(handle, 'POST', `/api/core/signing-keys/${signed.keyId}/retire`, { actor: owner, body: { confirm: true } })
    expect(done.status).toBe(200)
    const body = await done.json() as { state: string, replacedBy: string }
    expect(body.state).toBe('retired')
    const after = await keys()
    expect(after.find(k => k.id === signed.keyId)).toMatchObject({ state: 'retired', private_key: null })
    expect(after.find(k => k.id === body.replacedBy)!.state).toBe('current')
    expect(await inContext(() => signing.verify(PURPOSE, signed.keyId, code, signed.signature))).toBe(false)
    const audit = await rows<{ ability: string }>("SELECT ability FROM core_audit WHERE record_type = 'core.signing-key' AND record_id = ? AND ability IS NOT NULL", signed.keyId)
    expect(audit.map(a => a.ability)).toContain('core.signing-key.retire')
  })

  it('warns on the health screen when a key is past its rotation date', async () => {
    setClock(Date.UTC(2026, 10, 16))
    await inContext(() => signing.sign(PURPOSE, 'x'))
    expect((await inContext(() => healthCheck.check())).state).toBe('ok')
    advanceClock(91 * DAY)
    expect(await inContext(() => healthCheck.check())).toMatchObject({ state: 'warning' })
  })

  it('keeps one current key when two instances sign the first code at once', async () => {
    const results = await Promise.all([0, 1, 2].map(() => inContext(() => signing.sign(PURPOSE, 'race'))))
    expect(new Set(results.map(r => r.keyId)).size).toBe(1)
    expect((await keys()).filter(k => k.state === 'current')).toHaveLength(1)
  })
})
