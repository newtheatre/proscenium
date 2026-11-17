import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import messages from '../../layers/core/i18n/en-GB/validation.json'
import { blankAsNull, validationMessage } from '../../layers/core/shared/validation'

const catalogue = messages as Record<string, string>
function t(key: string, params: Record<string, string | number> = {}) {
  let text = catalogue[key]
  if (typeof params.count === 'number') text = catalogue[`${key}.${params.count === 1 ? 'one' : 'other'}`] ?? text
  return (text ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]))
}
const say = (schema: z.ZodType, value: unknown) => schema.safeParse(value, { error: issue => validationMessage(issue, t) }).error?.issues.map(i => i.message)

describe('validation messages', () => {
  it('say what to do, in plain words', () => {
    expect(say(z.string().min(1), '')).toEqual(['This is needed.'])
    expect(say(z.string(), undefined)).toEqual(['This is needed.'])
    expect(say(z.string().min(3), 'ab')).toEqual(['Use at least 3 characters.'])
    expect(say(z.string().max(1), 'ab')).toEqual(['Use 1 character or fewer.'])
    expect(say(z.number().int().positive().max(10), 11)).toEqual(['Use 10 or less.'])
    expect(say(z.number().positive(), 0)).toEqual(['Use more than 0.'])
    expect(say(z.number().int(), 1.5)).toEqual(['Enter a whole number.'])
    expect(say(z.string().url(), 'not a link')).toEqual(['Enter a web address, such as https://example.org.'])
    expect(say(z.string().startsWith('https://'), 'http://a.org')).toEqual(['Start it with https://'])
    expect(say(z.email(), 'me@')).toEqual(['Enter an email address, such as name@example.org.'])
    expect(say(z.email(), '')).toEqual(['This is needed.'])
    expect(say(z.enum(['a', 'b']), 'c')).toEqual(['Choose one of the options.'])
    expect(say(z.array(z.string()).min(1), [])).toEqual(['Choose at least one.'])
  })

  it('leave a schema\'s own message alone', () => {
    expect(say(z.string().min(3, 'Give a name of at least 3 characters.'), 'ab')).toEqual(['Give a name of at least 3 characters.'])
  })

  it('check a form\'s empty fields as the null they are sent as', () => {
    const schema = blankAsNull(z.object({ title: z.string().min(1), link: z.string().url().nullable() }))
    expect(schema.safeParse({ title: 'Hamlet', link: '  ' }).success).toBe(true)
    expect(say(schema, { title: '', link: 'not a link' })).toEqual(['This is needed.', 'Enter a web address, such as https://example.org.'])
  })
})
