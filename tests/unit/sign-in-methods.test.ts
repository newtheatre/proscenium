import { describe, expect, test } from 'bun:test'
import { methodsOf, refusalToAddPassword, refusalToRemove } from '#shared/utils/sign-in-methods'
import type { MethodSnapshot } from '#shared/utils/sign-in-methods'

// A-113: an account follows how somebody actually signs in, and never locks them out. The
// refusals are here rather than in a route so that every path shares one answer (criterion 1).

const DAY = 24 * 60 * 60

function snapshot(over: Partial<MethodSnapshot> = {}): MethodSnapshot {
  return {
    email: 'imogen.hart@example.invalid',
    passwordSetAt: 1000 * DAY,
    passwordLastUsedAt: 1010 * DAY,
    googleSub: null,
    googleLinkedAt: null,
    googleLastUsedAt: null,
    passkeys: [],
    ...over,
  }
}

const WORKSPACE = { email: 'imogen.hart@newtheatre.org.uk', passwordSetAt: null, passwordLastUsedAt: null }

describe('the list says what is on the account', () => {
  test('a password-only account has one method', () => {
    const methods = methodsOf(snapshot())
    expect(methods.map(method => method.kind)).toEqual(['password'])
  })

  test('each method carries when it was added and when it was last used', () => {
    const [password] = methodsOf(snapshot())
    expect(password?.addedAt).toBe(1000 * DAY)
    expect(password?.lastUsedAt).toBe(1010 * DAY)
  })

  test('a method never used says so rather than guessing', () => {
    const [password] = methodsOf(snapshot({ passwordLastUsedAt: null }))
    expect(password?.lastUsedAt).toBeNull()
  })

  test('every passkey is its own method, addressed by its own id', () => {
    const methods = methodsOf(snapshot({
      passkeys: [
        { id: 'pk-1', label: 'Phone', createdAt: 900 * DAY, lastUsedAt: 950 * DAY },
        { id: 'pk-2', label: null, createdAt: 960 * DAY, lastUsedAt: null },
      ],
    }))
    expect(methods.map(method => method.id)).toEqual(['password', 'pk-1', 'pk-2'])
    expect(methods.find(method => method.id === 'pk-2')?.label).toBeTruthy()
  })

  test('a Workspace account signs in with Google and holds no password', () => {
    const methods = methodsOf(snapshot({ ...WORKSPACE, googleSub: 'sub-1', googleLinkedAt: 800 * DAY }))
    expect(methods.map(method => method.kind)).toEqual(['google'])
  })
})

// Criterion 1 and criterion 5: the refusal is the same wherever it is asked from.
describe('the last way in is never removed', () => {
  test('the only password cannot be removed', () => {
    expect(refusalToRemove(snapshot(), 'password')).toBeTruthy()
  })

  test('the only Google link cannot be unlinked', () => {
    expect(refusalToRemove(snapshot({ ...WORKSPACE, googleSub: 'sub-1' }), 'google')).toBeTruthy()
  })

  test('the only passkey cannot be removed', () => {
    const only = snapshot({
      passwordSetAt: null,
      passwordLastUsedAt: null,
      passkeys: [{ id: 'pk-1', label: 'Phone', createdAt: 900 * DAY, lastUsedAt: null }],
    })
    expect(refusalToRemove(only, 'pk-1')).toBeTruthy()
  })

  test('a password goes when a passkey remains', () => {
    const both = snapshot({ passkeys: [{ id: 'pk-1', label: 'Phone', createdAt: 900 * DAY, lastUsedAt: null }] })
    expect(refusalToRemove(both, 'password')).toBeNull()
    expect(refusalToRemove(both, 'pk-1')).toBeNull()
  })

  test('what cannot be removed says so in the listing, so the screen does not offer it', () => {
    expect(methodsOf(snapshot()).map(method => method.removable)).toEqual([false])
  })

  test('removing something the account does not have is refused, not ignored', () => {
    expect(refusalToRemove(snapshot(), 'google')).toBeTruthy()
    expect(refusalToRemove(snapshot(), 'pk-missing')).toBeTruthy()
  })
})

// Criterion 3, which is decision 0008: no password may exist on a Workspace address, ever.
describe('a Workspace address is Google-only', () => {
  test('adding a password to one is refused', () => {
    expect(refusalToAddPassword(snapshot({ ...WORKSPACE, googleSub: 'sub-1' }))).toBeTruthy()
  })

  test('the refusal names Google, so the reader knows what to do instead', () => {
    expect(refusalToAddPassword(snapshot({ ...WORKSPACE, googleSub: 'sub-1' }))).toContain('Google')
  })

  test('an ordinary address may add or replace one', () => {
    expect(refusalToAddPassword(snapshot({ passwordSetAt: null, passwordLastUsedAt: null }))).toBeNull()
    expect(refusalToAddPassword(snapshot())).toBeNull()
  })
})
