import { describe, expect, test } from 'bun:test'
import { CONFIG_KEYS } from '#shared/utils/config'
import { ABSOLUTE_PASSWORD_LIMIT, defaultPasswordPolicy, isWorkspaceEmail, normaliseEmail, passwordProblem, sessionIsCurrent } from '#shared/utils/auth'
import { saysPasswordPolicy } from '#shared/utils/password-messages'

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

  // The routes bound the body at the absolute limit and leave the policy to passwordProblem.
  // That only holds if the configuration can never be set above the bound the routes accept.
  test('the configuration can never exceed the transport limit', () => {
    expect(CONFIG_KEYS.PASSWORD_MAX_LENGTH.schema.safeParse(ABSOLUTE_PASSWORD_LIMIT + 1).success).toBe(false)
    expect(CONFIG_KEYS.PASSWORD_MAX_LENGTH.schema.safeParse(policy.maxLength).success).toBe(true)
    expect(ABSOLUTE_PASSWORD_LIMIT).toBeGreaterThan(policy.maxLength)
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

// The hint under a password field says only what the policy will accept: the configuration can
// demand mixed case, a number and a symbol, and a fixed sentence about length contradicts it.
describe('the hint under a password field reads the policy (0012)', () => {
  const base = { minLength: 12, maxLength: 100, requireMixedCase: false, requireNumber: false, requireSymbol: false }

  test('a length-only policy says length is what counts', () => {
    const said = saysPasswordPolicy(base)
    expect(said).toContain('At least 12 characters')
    expect(said).toContain('Length beats punctuation')
  })

  test('a policy that demands more never promises a few words are enough', () => {
    const said = saysPasswordPolicy({ ...base, requireSymbol: true })
    expect(said).not.toContain('Length beats punctuation')
    expect(said).toContain('a symbol')
  })

  test('every demand the policy makes is named, in one sentence', () => {
    expect(saysPasswordPolicy({ ...base, requireMixedCase: true, requireNumber: true, requireSymbol: true }))
      .toBe('At least 12 characters, including upper and lower case, a number and a symbol.')
  })

  test('two demands are joined without a comma', () => {
    expect(saysPasswordPolicy({ ...base, requireNumber: true, requireSymbol: true }))
      .toBe('At least 12 characters, including a number and a symbol.')
  })
})
