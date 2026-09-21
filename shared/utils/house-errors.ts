import { z } from 'zod'
import type { $ZodErrorMap, $ZodRawIssue } from 'zod/v4/core'

// What a check with no wording of its own says (K-128 criterion 2). Every sentence here is a
// last resort: a schema that writes its own message keeps it, because zod tries that first.
export const HOUSE_ERROR = {
  generic: 'Something on this form needs another look.',
  email: 'That does not look like an email address. Check it and try again.',
  tooLong: 'That is too long.',
  tooShort: 'That is too short.',
  tooLow: 'That is too low.',
  tooHigh: 'That is too high.',
  choice: 'Choose one of the options offered.',
} as const

const COUNTED = new Set(['number', 'int', 'bigint', 'date'])

// Deliberately short and general: the map exists so nothing zod writes reaches a person, not so
// that every check gets bespoke wording. Bespoke wording belongs on the schema.
export const houseErrorMap: $ZodErrorMap = (issue: $ZodRawIssue) => {
  switch (issue.code) {
    case 'invalid_format':
      return issue.format === 'email' ? HOUSE_ERROR.email : HOUSE_ERROR.generic
    case 'too_big':
      return COUNTED.has(issue.origin) ? HOUSE_ERROR.tooHigh : HOUSE_ERROR.tooLong
    case 'too_small':
      if (COUNTED.has(issue.origin)) return HOUSE_ERROR.tooLow
      return Number(issue.minimum) > 1 ? HOUSE_ERROR.tooShort : HOUSE_ERROR.generic
    case 'invalid_value':
      return HOUSE_ERROR.choice
    default:
      return HOUSE_ERROR.generic
  }
}

// Global to the zod instance, so it is registered once at startup on each side rather than per
// schema; calling it again is harmless.
export function registerHouseErrors(): void {
  z.config({ customError: houseErrorMap })
}
