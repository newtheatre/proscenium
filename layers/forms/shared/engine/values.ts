// Small pure helpers the rest of the engine shares: what counts as empty, exact arithmetic, dates.
import type { Definition, Group, Question, QuestionType, Calculation, Operator } from './types'
import { questionsOf } from './definition'

export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.values(v as object).every(isEmpty)
  return false
}

/** Text is compared without regard to case or the spaces round it. */
export const fold = (s: string): string => s.trim().toLocaleLowerCase('en')

// ---- exact arithmetic ----
// Money is whole minor units and a division rounds once, at the end (the test "Pennies"), so sums are
// kept as a fraction of two whole numbers until a result is asked for.
export interface Fraction { n: number, d: number }
function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a || 1
}
export function fraction(n: number, d = 1): Fraction | null {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null
  if (!Number.isInteger(n)) {
    // A decimal as typed, such as 2.5, becomes 25/10; anything stranger is held to six places.
    const s = String(n)
    const places = /^-?\d+\.\d+$/.test(s) ? Math.min(s.split('.')[1]!.length, 9) : 6
    d *= 10 ** places
    n = Math.round(n * 10 ** places)
  }
  if (d < 0) {
    n = -n
    d = -d
  }
  const g = gcd(n, d)
  const out = { n: n / g, d: d / g }
  return Number.isSafeInteger(out.n) && Number.isSafeInteger(out.d) ? out : null
}
export const fAdd = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d)
export const fSub = (a: Fraction, b: Fraction) => fraction(a.n * b.d - b.n * a.d, a.d * b.d)
export const fMul = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d)
export const fDiv = (a: Fraction, b: Fraction) => (b.n === 0 ? null : fraction(a.n * b.d, a.d * b.n))
export const fCompare = (a: Fraction, b: Fraction): number => Math.sign(a.n * b.d - b.n * a.d)
/** Rounds half up to a whole number, in whole-number arithmetic throughout. */
export function fRound(a: Fraction, places = 0): Fraction | null {
  const scale = 10 ** places
  const num = 2 * a.n * scale + a.d
  const den = 2 * a.d
  const floor = (num - (((num % den) + den) % den)) / den
  return fraction(floor, scale)
}
export const fNumber = (a: Fraction): number => a.n / a.d

// ---- dates ----
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
export function isDate(s: unknown): s is string {
  if (typeof s !== 'string') return false
  const m = DATE.exec(s)
  if (!m) return false
  const t = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!))
  return t.getUTCFullYear() === +m[1]! && t.getUTCMonth() === +m[2]! - 1 && t.getUTCDate() === +m[3]!
}
export const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
export const isDateTime = (s: unknown): s is string => typeof s === 'string' && s.length === 16 && s[10] === 'T' && isDate(s.slice(0, 10)) && isTime(s.slice(11))
/** Whole days since 1970 for a calendar date. Calendar dates have no time zone, so UTC is exact. */
const dayNumber = (date: string): number => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000
export const daysBetween = (from: string, to: string): number => dayNumber(to.slice(0, 10)) - dayNumber(from.slice(0, 10))
export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86400000).toISOString().slice(0, 10) + date.slice(10)
}

// ---- what a definition holds, found once ----
export interface Index {
  questions: Map<string, { question: Question, page: number, group?: Group }>
  groups: Map<string, { group: Group, page: number }>
  calculations: Map<string, Calculation>
  pageOf: Map<string, number>
}
export function indexOf(def: Definition): Index {
  const index: Index = { questions: new Map(), groups: new Map(), calculations: new Map(), pageOf: new Map() }
  for (const q of questionsOf(def)) index.questions.set(q.question.id, q)
  def.pages.forEach((page, p) => {
    index.pageOf.set(page.id, p)
    for (const it of page.items) if (it.kind === 'group') index.groups.set(it.id, { group: it, page: p })
  })
  for (const c of def.calculations ?? []) index.calculations.set(c.id, c)
  return index
}

// ---- which comparisons suit which kind of value (part 3, "Conditions") ----
export type ValueKind = 'text' | 'number' | 'date' | 'single' | 'multiple' | 'group' | 'other' | 'any'
export function kindOfQuestion(q: Pick<Question, 'type' | 'multiple'>): ValueKind {
  const kinds: Record<QuestionType, ValueKind> = {
    'text.short': 'text', 'text.long': 'text', 'email': 'text', 'phone': 'text', 'url': 'text',
    'number': 'number', 'money': 'number', 'rating': 'number', 'scale': 'number',
    'date': 'date', 'time': 'date', 'datetime': 'date',
    'choice.single': 'single', 'yesno': 'single', 'consent': 'single',
    'choice.dropdown': q.multiple ? 'multiple' : 'single', 'record': q.multiple ? 'multiple' : 'single',
    'choice.multiple': 'multiple', 'choice.ranking': 'multiple', 'file': 'multiple',
    'address': 'other',
  }
  return kinds[q.type]
}
const PRESENCE: Operator[] = ['answered', 'empty']
const BY_KIND: Record<ValueKind, Operator[]> = {
  text: ['is', 'is-not', 'contains', 'not-contains', 'starts-with', ...PRESENCE],
  number: ['is', 'is-not', 'more-than', 'at-least', 'less-than', 'at-most', 'between', ...PRESENCE],
  date: ['is', 'before', 'after', 'on-or-before', 'on-or-after', 'within-days', ...PRESENCE],
  single: ['is', 'is-not', 'any-of', ...PRESENCE],
  multiple: ['includes', 'not-includes', 'includes-any', 'includes-all', 'count-at-least', ...PRESENCE],
  group: ['count-at-least', ...PRESENCE],
  other: [...PRESENCE],
  any: [],
}
/** The comparisons the builder offers for a kind of value. `any` (a fact or attribute) takes them all. */
export const operatorsFor = (kind: ValueKind): readonly Operator[] => BY_KIND[kind]
