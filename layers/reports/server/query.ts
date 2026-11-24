// The question in a report's address: scope as `<kind>:<id>`, so a link reproduces the view.
import { z } from 'zod'
import { getQuery, type H3Event } from 'h3'
import { PAGE_BREAKDOWNS, PERIOD_RULES, SCOPE_KINDS } from '../shared/reports'

const ID = /^[a-z]+_[A-Za-z0-9]+$/ // not-policy: the shape of a record id
const DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: a theatre-local date

export const scopeParam = z.string().max(80).transform((value, ctx) => { // not-policy: a kind and an id
  const [kind, id] = value.split(':')
  if (!kind || !id || !(SCOPE_KINDS as readonly string[]).includes(kind) || kind === 'none' || !ID.test(id)) {
    ctx.addIssue({ code: 'custom', message: 'A scope is a kind and an id, such as production:prd_1.' })
    return z.NEVER
  }
  return { kind: kind as 'season' | 'production' | 'venue', id }
})

export const dateParam = z.string().regex(DATE)
export const periodParam = z.enum(PERIOD_RULES)
export const breakdownParam = z.enum(PAGE_BREAKDOWNS)

/** A production scope in the address, so a grant on that production reads its report. */
export function scopeRecord(event: H3Event): readonly [string, string] | undefined {
  const scope = getQuery(event).scope
  if (typeof scope !== 'string' || !scope.startsWith('production:')) return undefined
  return ['core.production', scope.slice('production:'.length)]
}
