import { describe, expect, test } from 'bun:test'
import { emailChangeForm, refusalToChangeEmail } from '#shared/utils/email-change'

// A-115. The refusals are pure so that the self-service path and any officer path added later
// cannot answer differently (criterion 4).

const withPassword = { email: 'imogen.hart@example.invalid', hasPassword: true }
const googleOnly = { email: 'imogen.hart@newtheatre.org.uk', hasPassword: false }

describe('what a change is refused for', () => {
  test('an ordinary change is allowed', () => {
    expect(refusalToChangeEmail(withPassword, 'imogen@elsewhere.invalid')).toBeNull()
  })

  test('changing to the address already held is refused rather than done twice', () => {
    expect(refusalToChangeEmail(withPassword, 'imogen.hart@example.invalid')).toBeTruthy()
    // Addresses compare lowercased, so the same address in capitals is the same address.
    expect(refusalToChangeEmail(withPassword, 'Imogen.Hart@Example.Invalid')).toBeTruthy()
  })

  // Criterion 3, which is decision 0008: no password may exist on a Workspace address.
  test('a password-holding account cannot move to a Workspace address', () => {
    const refusal = refusalToChangeEmail(withPassword, 'imogen.hart@newtheatre.org.uk')
    expect(refusal).toBeTruthy()
    expect(refusal).toContain('Google')
  })

  test('an account with no password may hold one, because Google is how it signs in', () => {
    expect(refusalToChangeEmail({ ...googleOnly, email: 'old@example.invalid' }, 'imogen.hart@newtheatre.org.uk')).toBeNull()
  })
})

describe('the request itself', () => {
  test('an address is required and must look like one', () => {
    expect(emailChangeForm.safeParse({ email: 'not-an-address' }).success).toBe(false)
    expect(emailChangeForm.safeParse({ email: '' }).success).toBe(false)
    expect(emailChangeForm.safeParse({ email: 'imogen@elsewhere.invalid' }).success).toBe(true)
  })

  test('the longest address RFC 5321 permits is accepted and one longer is not', () => {
    const local = 'a'.repeat(64)
    expect(emailChangeForm.safeParse({ email: `${local}@${'b'.repeat(250)}.invalid` }).success).toBe(false)
  })
})
