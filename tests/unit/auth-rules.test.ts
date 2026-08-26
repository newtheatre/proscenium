import { describe, expect, test } from 'bun:test'
import { MIN_PASSWORD_LENGTH, isWorkspaceEmail, normaliseEmail, passwordProblem, sessionIsCurrent } from '../../shared/auth'

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

describe('password rules (0008)', () => {
  test('a Workspace address may never set a password', () => {
    expect(passwordProblem('officer@newtheatre.org.uk', 'x'.repeat(20))?.reason).toBe('workspace-address')
  })

  test('length is the only other rule', () => {
    expect(passwordProblem('m@example.invalid', 'x'.repeat(MIN_PASSWORD_LENGTH - 1))?.reason).toBe('too-short')
    expect(passwordProblem('m@example.invalid', 'x'.repeat(201))?.reason).toBe('too-long')
    expect(passwordProblem('m@example.invalid', 'correct horse battery staple')).toBeNull()
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
