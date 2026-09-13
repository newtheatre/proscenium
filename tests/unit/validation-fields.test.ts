import { describe, expect, test } from 'bun:test'
import { fieldsFrom } from '../../shared/utils/validation-fields'

describe('fieldsFrom (issue 913)', () => {
  test('keys by the field path and keeps the schema\'s own message', () => {
    const fields = fieldsFrom([{ path: ['guest', 'email'], message: 'Enter a real email address' }], 'body')
    expect(fields).toEqual({ 'guest.email': 'Enter a real email address' })
  })

  test('a top-level failure falls back to the given label', () => {
    const fields = fieldsFrom([{ path: [], message: 'Expected object, received string' }], 'body')
    expect(fields).toEqual({ body: 'Expected object, received string' })
  })

  test('the first message for a repeated field wins', () => {
    const fields = fieldsFrom([
      { path: ['name'], message: 'Enter your name' },
      { path: ['name'], message: 'Too small: expected string to have >=1 characters' },
    ], 'body')
    expect(fields).toEqual({ name: 'Enter your name' })
  })

  test('several distinct fields each keep their own message', () => {
    const fields = fieldsFrom([
      { path: ['name'], message: 'Enter your name' },
      { path: ['email'], message: 'Enter a real email address' },
    ], 'body')
    expect(fields).toEqual({ name: 'Enter your name', email: 'Enter a real email address' })
  })
})
