// How a schema's problems read to a person. Zod's own messages are written for developers ("Too small:
// expected string to have >=1 characters"); these say what to do, in plain words, from the catalogue.
// The app and the server install the same map (plugins/validation.ts on each side), so a form shows
// the message the server would send for the same value. A message a schema writes itself
// (`.min(3, 'Give a name of at least 3 characters.')`) always wins over these.
import { z } from 'zod'

type Translate = (key: string, params?: Record<string, string | number>) => string
type Issue = z.core.$ZodRawIssue

const KEY = 'core.form.invalid'
const blank = (input: unknown) => input === undefined || input === null || (typeof input === 'string' && input.trim() === '')

/** The message for one problem, or undefined to keep zod's own. */
export function validationMessage(issue: Issue, t: Translate): string | undefined {
  const i = issue as Issue & { origin?: string, minimum?: number | bigint, maximum?: number | bigint, inclusive?: boolean, format?: string, prefix?: string, suffix?: string, expected?: string, divisor?: number }
  switch (i.code) {
    case 'invalid_type':
      if (blank(i.input)) return t(`${KEY}.required`)
      if (i.expected === 'int') return t(`${KEY}.whole-number`)
      if (i.expected === 'number' || i.expected === 'bigint') return t(`${KEY}.number`)
      return t(`${KEY}.value`)
    case 'too_small': {
      const n = Number(i.minimum)
      if (i.origin === 'string') return n <= 1 ? t(`${KEY}.required`) : t(`${KEY}.too-short`, { count: n })
      if (i.origin === 'array' || i.origin === 'set') return t(`${KEY}.too-few`, { count: n })
      if (i.origin === 'number' || i.origin === 'bigint') return t(i.inclusive === false ? `${KEY}.above` : `${KEY}.at-least`, { minimum: n })
      return undefined
    }
    case 'too_big': {
      const n = Number(i.maximum)
      if (i.origin === 'string') return t(`${KEY}.too-long`, { count: n })
      if (i.origin === 'array' || i.origin === 'set') return t(`${KEY}.too-many`, { count: n })
      if (i.origin === 'number' || i.origin === 'bigint') return t(i.inclusive === false ? `${KEY}.below` : `${KEY}.at-most`, { maximum: n })
      return undefined
    }
    case 'invalid_format':
      if (blank(i.input)) return t(`${KEY}.required`)
      if (i.format === 'email') return t(`${KEY}.email`)
      if (i.format === 'url') return t(`${KEY}.url`)
      if (i.format === 'starts_with') return t(`${KEY}.starts-with`, { prefix: i.prefix ?? '' })
      if (i.format === 'ends_with') return t(`${KEY}.ends-with`, { suffix: i.suffix ?? '' })
      return t(`${KEY}.format`)
    case 'invalid_value':
      return t(`${KEY}.choice`)
    case 'not_multiple_of':
      return t(`${KEY}.multiple-of`, { divisor: i.divisor ?? 1 })
    default:
      return undefined
  }
}

/** Installs the messages for every schema in this runtime. Each side calls it once, with its catalogue. */
export function installValidationMessages(t: Translate): void {
  z.config({ customError: issue => validationMessage(issue, t) })
}

/**
 * A form holds '' in a field left empty, where the server takes null. This checks a form's values the
 * way they will be sent: an empty or blank text is null, so an optional field left empty passes, and a
 * needed one says it is needed. Pass the schema the route uses (`blankAsNull(productionPatch)`).
 */
export function blankAsNull<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]))
  }, schema)
}
