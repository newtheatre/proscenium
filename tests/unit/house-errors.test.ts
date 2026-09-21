import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { HOUSE_ERROR, registerHouseErrors } from '#shared/utils/house-errors'

// K-128 criterion 2: zod's stock English ("Too small: expected string to have >=1 characters")
// reaches a screen through `refusalText`, so the map below is what a field with no message says.
registerHouseErrors()

function firstMessage(schema: z.ZodType, input: unknown): string {
  const result = schema.safeParse(input)
  if (result.success) throw new Error('expected the parse to fail')
  return result.error.issues[0]!.message
}

describe('a check with no message of its own speaks in the house voice', () => {
  test('a missing required field', () => {
    expect(firstMessage(z.object({ name: z.string() }), {})).toBe(HOUSE_ERROR.generic)
  })

  test('an empty required string', () => {
    expect(firstMessage(z.string().min(1), '')).toBe(HOUSE_ERROR.generic)
  })

  test('a value of the wrong type', () => {
    expect(firstMessage(z.object({ count: z.number() }), { count: 'seven' })).toBe(HOUSE_ERROR.generic)
  })

  test('an address that is not one', () => {
    expect(firstMessage(z.string().email(), 'nope')).toBe(HOUSE_ERROR.email)
  })

  test('text past its limit', () => {
    expect(firstMessage(z.string().max(3), 'far too long')).toBe(HOUSE_ERROR.tooLong)
  })

  test('a number below its floor', () => {
    expect(firstMessage(z.number().min(10), 4)).toBe(HOUSE_ERROR.tooLow)
  })

  test('a number above its ceiling', () => {
    expect(firstMessage(z.number().max(10), 40)).toBe(HOUSE_ERROR.tooHigh)
  })

  test('text below a floor above one', () => {
    expect(firstMessage(z.string().min(6), 'four')).toBe(HOUSE_ERROR.tooShort)
  })

  test('a choice outside the list offered', () => {
    expect(firstMessage(z.enum(['DRAFT', 'LIVE']), 'MAYBE')).toBe(HOUSE_ERROR.choice)
  })
})

describe('nothing zod writes reaches a person', () => {
  test.each([
    z.object({ name: z.string() }),
    z.string().min(1),
    z.string().email(),
    z.string().max(3),
    z.number().min(10),
    z.enum(['DRAFT', 'LIVE']),
    z.array(z.string()).min(2),
    z.string().uuid(),
    z.number().int(),
  ])('no developer wording, bound or type name in the message', (schema) => {
    const message = firstMessage(schema as z.ZodType, {})
    expect(message).not.toMatch(/expected|received|Invalid input|Too small|Too big|>=|<=|characters|element/i)
    expect(Object.values(HOUSE_ERROR)).toContain(message)
  })
})

describe('a schema that wrote its own message keeps it', () => {
  test('the house map never overwrites house wording', () => {
    expect(firstMessage(z.string().min(1, 'Type your password'), '')).toBe('Type your password')
  })

  test('an object field keeps its own message too', () => {
    const schema = z.object({ email: z.string().email('Type the email address on your account') })
    expect(firstMessage(schema, { email: 'nope' })).toBe('Type the email address on your account')
  })
})
