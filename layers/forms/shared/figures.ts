// How a calculated value reads: on the form as it is filled in, beside a response's answers, in the
// responses table and in an export. The value is what the server worked out; this only words it.
import type { Calculation, CalculationType, Definition } from './engine/types'
import { questionsOf } from './engine/definition'

export type Figure = string | number | null | undefined

/** What a calculation is called where people read it. */
export const figureName = (c: Pick<Calculation, 'label' | 'key'>): string => c.label?.trim() || c.key

/** A value for people to read: money in the theatre's currency, a share as a percentage. */
export function figureText(type: CalculationType, value: Figure, o: { locale: string, currency: string, day?: (iso: string) => string }): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string') return type === 'date' && o.day ? o.day(value) : value
  if (type === 'money') {
    const money = new Intl.NumberFormat(o.locale, { style: 'currency', currency: o.currency })
    const digits = money.resolvedOptions().maximumFractionDigits ?? 2 // not-policy: the usual minor unit when a currency names none
    return money.format(value / 10 ** digits)
  }
  if (type === 'percent') return new Intl.NumberFormat(o.locale, { style: 'percent', maximumFractionDigits: 1 }).format(value) // not-policy: one place is enough to read a share
  return new Intl.NumberFormat(o.locale, { maximumFractionDigits: 2 }).format(value) // not-policy: two places is enough to read a worked-out number
}

/** A value for a spreadsheet: plain digits a spreadsheet reads as a number, as answers are exported. */
export function figureCell(type: CalculationType, value: Figure): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (type === 'money') return (value / 100).toFixed(2) // not-policy: minor units to units, as money answers are exported
  if (type === 'percent') return `${Number((value * 100).toFixed(2))}%` // not-policy: a share as a percentage, to two places
  return String(value)
}

/**
 * The calculations worked out, directly or through another calculation, from a special-category
 * answer. Their values are as sensitive as the answers, so they are shown only where those are.
 */
export function specialCalculations(def: Definition): Set<string> {
  const special = new Set<string>()
  for (const { question } of questionsOf(def)) if (question.dataClass === 'special') special.add(question.id)
  const reads = new Map((def.calculations ?? []).map(c => [c.id, JSON.stringify(c.expression)]))
  const out = new Set<string>()
  const touches = (text: string, ids: Iterable<string>, field: string) => [...ids].some(id => text.includes(`"${field}":${JSON.stringify(id)}`))
  for (let grew = true; grew;) {
    grew = false
    for (const [id, text] of reads) {
      if (out.has(id)) continue
      if (touches(text, special, 'answer') || touches(text, special, 'of') || touches(text, out, 'calculation')) {
        out.add(id)
        grew = true
      }
    }
  }
  return out
}
