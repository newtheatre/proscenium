import { describe, expect, test } from 'bun:test'
import { defaultPasswordPolicy, isWorkspaceEmail, normaliseEmail, passwordProblem, sessionIsCurrent } from '../../shared/auth'

describe('addresses', () => {
  test('an address normalises to lowercase and trimmed', () => {
    expect(normaliseEmail('  Shouty@Example.Invalid ')).toBe('shouty@example.invalid')
  })

  test('a Workspace address is recognised however it is typed', () => {
    expect(isWorkspaceEmail('Officer@NewTheatre.org.uk')).toBe(true)
    expect(isWorkspaceEmail('member@example.invalid')).toBe(false)
    // The suffix must be the domain, not merely end with it.
    expect(isWorkspaceEmail('someone@notnewtheatre.org.uk.example.invalid')).toBe(false)
  })
})

describe('password rules (0008, 0012)', () => {
  const policy = defaultPasswordPolicy()
  const address = 'm@example.invalid'

  test('a Workspace address may never set a password', () => {
    expect(passwordProblem('officer@newtheatre.org.uk', 'x'.repeat(20))?.reason).toBe('workspace-address')
  })

  test('length is the only rule that ships enabled', () => {
    expect(passwordProblem(address, 'x'.repeat(policy.minLength - 1))?.reason).toBe('too-short')
    expect(passwordProblem(address, 'x'.repeat(policy.maxLength + 1))?.reason).toBe('too-long')
    expect(passwordProblem(address, 'correct horse battery staple')).toBeNull()
  })

  // A cap exists because hashing is deliberately expensive, not to stop anyone using a long
  // passphrase, so the shipped one must be far above any real password.
  test('the cap is well clear of a real passphrase and a manager-generated secret', () => {
    expect(policy.maxLength).toBeGreaterThanOrEqual(64)
    expect(passwordProblem(address, 'x'.repeat(64))).toBeNull()
  })

  test('length counts characters as a person sees them', () => {
    // Sixteen emoji: four UTF-16 code units each, so a naive length would pass a short password.
    expect(passwordProblem(address, '🎭'.repeat(policy.minLength - 1))?.reason).toBe('too-short')
    expect(passwordProblem(address, '🎭'.repeat(policy.minLength))).toBeNull()
  })

  test('composition rules ship off', () => {
    expect(policy.requireMixedCase).toBe(false)
    expect(policy.requireNumber).toBe(false)
    expect(policy.requireSymbol).toBe(false)
    expect(passwordProblem(address, 'aaaaaaaaaaaaaaaaaaaa')).toBeNull()
  })

  test('each composition rule enforces when switched on', () => {
    const long = 'aaaaaaaaaaaaaaaaaaaa'
    expect(passwordProblem(address, long, { ...policy, requireMixedCase: true })?.reason).toBe('needs-mixed-case')
    expect(passwordProblem(address, long, { ...policy, requireNumber: true })?.reason).toBe('needs-number')
    expect(passwordProblem(address, long, { ...policy, requireSymbol: true })?.reason).toBe('needs-symbol')

    const all = { ...policy, requireMixedCase: true, requireNumber: true, requireSymbol: true }
    expect(passwordProblem(address, 'Aaaaaaaaaaaaaaaaaaa1!', all)).toBeNull()
  })
})

describe('session currency (0007)', () => {
  const user = { sessionEpoch: 3, disabled: false, anonymisedAt: null }

  test('a session at the current epoch is good', () => {
    expect(sessionIsCurrent({ epoch: 3 }, user)).toBe(true)
  })

  test('bumping the epoch revokes every existing session', () => {
    expect(sessionIsCurrent({ epoch: 2 }, user)).toBe(false)
  })

  test('a disabled or anonymised account has no valid session', () => {
    expect(sessionIsCurrent({ epoch: 3 }, { ...user, disabled: true })).toBe(false)
    expect(sessionIsCurrent({ epoch: 3 }, { ...user, anonymisedAt: 1 })).toBe(false)
  })

  test('no session and no user are both refused', () => {
    expect(sessionIsCurrent(null, user)).toBe(false)
    expect(sessionIsCurrent({ epoch: 3 }, null)).toBe(false)
  })
})
