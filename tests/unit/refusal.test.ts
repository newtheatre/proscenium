import { describe, expect, test } from 'bun:test'
import { refusalText } from '../../app/utils/refusal'

// $fetch's own shape for an h3 createError: the response body lands whole on .data, and a
// route's own `data:` payload (createError's second-level data) nests one level further under it.
function refusal(statusMessage: string, data?: Record<string, unknown>): unknown {
  return { data: { statusMessage, data } }
}

describe('refusalText prefers a field message (issue 913)', () => {
  test('a single field failure is shown by its own message, not the generic sentence', () => {
    const error = refusal('Invalid request: guest.email', { fields: { 'guest.email': 'Enter a real email address' } })
    expect(refusalText(error)).toBe('Enter a real email address')
  })

  test('the first field wins when more than one failed', () => {
    const error = refusal('Invalid request: name, email', {
      fields: { name: 'Enter your name', email: 'Enter a real email address' },
    })
    expect(refusalText(error)).toBe('Enter your name')
  })

  test('a refusal with no fields falls back to the statusMessage as before', () => {
    const error = refusal('That booking is not waiting for a decision')
    expect(refusalText(error)).toBe('That booking is not waiting for a decision')
  })

  test('a refusal with an empty fields map falls back to the statusMessage', () => {
    const error = refusal('Invalid request: body', { fields: {} })
    expect(refusalText(error)).toBe('Invalid request: body')
  })
})
