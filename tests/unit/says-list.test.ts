import { describe, expect, test } from 'bun:test'
import { saysList } from '#shared/utils/text'

// A list read as a sentence, as the grant form names every role that waits on an authenticator (0257).
describe('a list reads as a sentence', () => {
  test('none, one, two and several', () => {
    expect(saysList([])).toBe('')
    expect(saysList(['Bar'])).toBe('Bar')
    expect(saysList(['Bar', 'Door'])).toBe('Bar and Door')
    expect(saysList(['Bar', 'Door', 'Duty manager'])).toBe('Bar, Door and Duty manager')
  })
})
