import { describe, expect, test } from 'bun:test'
import { protectedGrantRefusal, strandingBy, strandingRefusal } from '#shared/utils/protected-role'
import type { ProtectedHolder } from '#shared/utils/protected-role'

// A-120 criterion 1 and issue #1355: a grant that runs out is not an act, so the guard never sees
// it. The IT Manager the system keeps is therefore one whose grant cannot lapse (0009).

const LATER = 1_785_542_399
const permanent = (userId: string): ProtectedHolder => ({ userId, expiresAt: null })
const dated = (userId: string): ProtectedHolder => ({ userId, expiresAt: LATER })

describe('removing an IT Manager is refused when it would leave none that cannot lapse', () => {
  test('the last usable IT Manager is refused however their grant is dated', () => {
    expect(strandingBy([permanent('ada')], 'ada')).toBe('last')
    expect(strandingBy([dated('ada')], 'ada')).toBe('last')
  })

  test('the only permanent grant is refused while the others would all lapse', () => {
    expect(strandingBy([permanent('ada'), dated('bea')], 'ada')).toBe('dated')
  })

  test('a dated holder goes while a permanent one stays', () => {
    expect(strandingBy([permanent('ada'), dated('bea')], 'bea')).toBeNull()
    expect(strandingBy([permanent('ada'), permanent('bea')], 'ada')).toBeNull()
  })

  test('with every grant dated, no holder may go until one is made permanent', () => {
    expect(strandingBy([dated('ada'), dated('bea')], 'bea')).toBe('dated')
  })

  test('an account holding no IT Manager grant is never refused for one it does not hold', () => {
    expect(strandingBy([dated('ada'), dated('bea')], 'cal')).toBeNull()
    expect(strandingBy([permanent('ada')], 'cal')).toBeNull()
  })

  test('each refusal says what to do first', () => {
    expect(strandingRefusal('last', 'revoking')).toBe('That is the last IT Manager: grant another before revoking this one')
    expect(strandingRefusal('last', 'merging')).toBe('That is the last IT Manager: grant another before merging this one away')
    expect(strandingRefusal('dated', 'disabling')).toBe('No other IT Manager grant is permanent: make one permanent before disabling this one')
    expect(strandingRefusal('dated', 'erasing')).toBe('No other IT Manager grant is permanent: make one permanent before erasing this one')
  })
})

describe('a grant of the IT Manager role leaves one that cannot lapse', () => {
  test('dating the only permanent grant is refused, and says to choose Further notice', () => {
    const refusal = protectedGrantRefusal([permanent('ada'), dated('bea')], { userId: 'ada', expiresAt: LATER, usable: true })
    expect(refusal).toBe('No other IT Manager grant is permanent, so this one must be: choose Further notice')
    expect(protectedGrantRefusal([permanent('ada')], { userId: 'ada', expiresAt: LATER, usable: true })).toBe(refusal)
  })

  test('a dated grant beside a permanent one is the ordinary case', () => {
    expect(protectedGrantRefusal([permanent('ada')], { userId: 'bea', expiresAt: LATER, usable: true })).toBeNull()
    expect(protectedGrantRefusal([permanent('ada'), dated('bea')], { userId: 'bea', expiresAt: LATER, usable: true })).toBeNull()
  })

  test('with every grant dated, another dated one is refused and a permanent one is the way out', () => {
    expect(protectedGrantRefusal([dated('ada')], { userId: 'bea', expiresAt: LATER, usable: true })).not.toBeNull()
    expect(protectedGrantRefusal([dated('ada')], { userId: 'ada', expiresAt: LATER, usable: true })).not.toBeNull()
    expect(protectedGrantRefusal([dated('ada')], { userId: 'ada', expiresAt: null, usable: true })).toBeNull()
    expect(protectedGrantRefusal([dated('ada')], { userId: 'bea', expiresAt: null, usable: true })).toBeNull()
  })

  test('a permanent grant nobody can use yet does not count, so the refusal asks for a usable one', () => {
    const refusal = protectedGrantRefusal([dated('ada')], { userId: null, expiresAt: null, usable: false })
    expect(refusal).toBe('No IT Manager grant is permanent yet: make one permanent before granting another')
    expect(protectedGrantRefusal([dated('ada')], { userId: 'pending', expiresAt: LATER, usable: false })).toBe(refusal)
    expect(protectedGrantRefusal([permanent('ada')], { userId: null, expiresAt: LATER, usable: false })).toBeNull()
  })
})
