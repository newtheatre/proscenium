// The question in a report's address: scope as `<kind>:<id>`, so a link reproduces the view.
import { z } from 'zod'
import { getQuery, type H3Event } from 'h3'
import { MODULE_KEY, PERIOD_RULES, SCOPE_KINDS, isPageBreakdown } from '../shared/reports'

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
/** A key down the side or across: a shared one the page can name, or a module's own. */
export const keyParam = z.string().max(80).refine(k => isPageBreakdown(k) || MODULE_KEY.test(k), 'Not a breakdown.') // not-policy: a key's length

/** What asking for a copy of a report names: the report and the question put to it. */
export const copyAsk = z.object({ report: z.string().max(80), scope: scopeParam.optional(), period: periodParam.optional(), from: dateParam.optional(), to: dateParam.optional(), by: keyParam.optional() }) // not-policy: a report id's length

/** One or two keys, comma-separated: the rows, then the pivot (M5 allows two). */
export const byParam = z.string().max(170).transform((value, ctx) => { // not-policy: two keys
  const keys = value.split(',').filter(Boolean)
  if (!keys.length || keys.length > 2 || keys.some(k => !keyParam.safeParse(k).success) || new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: 'custom', message: 'One or two different breakdowns.' })
    return z.NEVER
  }
  return keys
})

const VALUE = /^[A-Za-z0-9_-]+$/ // not-policy: the shape of a key's value

/** A filter as `<key>:<value>,<value>`: one key, 1 to 20 values (B6). */
export const filterParam = z.string().max(2000).transform((value, ctx) => { // not-policy: twenty values
  const at = value.indexOf(':')
  const key = value.slice(0, at)
  const values = value.slice(at + 1).split(',').filter(Boolean)
  if (at < 1 || !keyParam.safeParse(key).success || !values.length || values.length > 20 || values.some(v => !VALUE.test(v))) { // not-policy: R3-27's bound
    ctx.addIssue({ code: 'custom', message: 'A filter is a key and one to twenty values, such as venue:ven_1,ven_2.' })
    return z.NEVER
  }
  return { key, values: [...new Set(values)] }
})

/** A production scope in the address, so a grant on that production reads its report. */
export function scopeRecord(event: H3Event): readonly [string, string] | undefined {
  const scope = getQuery(event).scope
  if (typeof scope !== 'string' || !scope.startsWith('production:')) return undefined
  return ['core.production', scope.slice('production:'.length)]
}
