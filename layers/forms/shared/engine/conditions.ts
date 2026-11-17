// Conditions: small trees of all, any and none over comparisons (part 3). A comparison with an
// empty answer is false, except "is empty" and "is not". Text ignores case and surrounding spaces;
// everything else is strict about type, so a number is never compared with text.
import type { Answers, Comparison, Condition, Context, Entry, Operand } from './types'
import type { Index } from './values'
import { daysBetween, fold, isEmpty, kindOfQuestion } from './values'

export interface Scope {
  index: Index
  /** Answers with the hidden ones already removed. */
  answers: Answers
  /** Inside a repeating group: the entry being looked at, and its group. */
  entry?: { group: string, values: Entry }
  calculated: (id: string) => string | number | null
  context: Context
}

interface Resolved { value: unknown, text: boolean }

export function resolve(operand: Operand, scope: Scope): Resolved {
  if ('answer' in operand) {
    const found = scope.index.questions.get(operand.answer)
    if (found) {
      const text = kindOfQuestion(found.question) === 'text'
      if (!found.group) return { value: scope.answers[operand.answer], text }
      // A question in a repeating group can only be read from inside the same entry.
      return { value: scope.entry?.group === found.group.id ? scope.entry.values[operand.answer] : undefined, text }
    }
    if (scope.index.groups.has(operand.answer)) {
      const entries = scope.answers[operand.answer]
      return { value: Array.isArray(entries) ? entries : [], text: false }
    }
    return { value: undefined, text: false }
  }
  if ('calculation' in operand) return { value: scope.calculated(operand.calculation), text: false }
  if ('fact' in operand) return { value: scope.context.facts?.[operand.fact], text: false }
  if ('attribute' in operand) return { value: scope.context.attributes?.[operand.attribute], text: false }
  if ('today' in operand) return { value: scope.context.today, text: false }
  if ('option' in operand) return { value: operand.option, text: false }
  return { value: operand.value, text: typeof operand.value === 'string' }
}

function same(left: Resolved, right: Resolved): boolean {
  const a = left.value
  const b = right.value
  if (typeof a !== typeof b) return false
  if (typeof a === 'string' && left.text) return fold(a) === fold(b as string)
  return a === b
}
const number = (r: Resolved): number | null => (typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : null)
const dateLike = (r: Resolved): string | null => (typeof r.value === 'string' && /^\d{4}-\d{2}-\d{2}|^\d{2}:\d{2}$/.test(r.value) ? r.value : null)
/** Compares two dates, times or date-times over the part they share, so a date meets a date-time by its day. */
function order(a: string, b: string): number {
  const length = Math.min(a.length, b.length)
  const x = a.slice(0, length)
  const y = b.slice(0, length)
  return x < y ? -1 : x > y ? 1 : 0
}

function compare(c: Comparison, scope: Scope): boolean {
  const left = resolve(c.left, scope)
  if (c.op === 'answered') return !isEmpty(left.value)
  if (c.op === 'empty') return isEmpty(left.value)
  if (isEmpty(left.value)) return c.op === 'is-not'

  const rights = (c.right === undefined ? [] : Array.isArray(c.right) ? c.right : [c.right]).map(r => resolve(r, scope))
  const right = rights[0]
  if (!right) return false

  switch (c.op) {
    case 'is': return same(left, right)
    case 'is-not': return !same(left, right)
    case 'any-of': return rights.some(r => same(left, r))
    case 'contains':
    case 'not-contains':
    case 'starts-with': {
      if (typeof left.value !== 'string' || typeof right.value !== 'string') return false
      const [text, part] = [fold(left.value), fold(right.value)]
      if (c.op === 'starts-with') return text.startsWith(part)
      return text.includes(part) === (c.op === 'contains')
    }
    case 'more-than':
    case 'at-least':
    case 'less-than':
    case 'at-most': {
      const [a, b] = [number(left), number(right)]
      if (a === null || b === null) return false
      return c.op === 'more-than' ? a > b : c.op === 'at-least' ? a >= b : c.op === 'less-than' ? a < b : a <= b
    }
    case 'between': {
      const [a, low, high] = [number(left), number(right), rights[1] ? number(rights[1]) : null]
      return a !== null && low !== null && high !== null && a >= low && a <= high
    }
    case 'before':
    case 'after':
    case 'on-or-before':
    case 'on-or-after': {
      const [a, b] = [dateLike(left), dateLike(right)]
      if (a === null || b === null) return false
      const o = order(a, b)
      return c.op === 'before' ? o < 0 : c.op === 'after' ? o > 0 : c.op === 'on-or-before' ? o <= 0 : o >= 0
    }
    case 'within-days': {
      const [a, b] = [dateLike(left), dateLike(right)]
      if (a === null || b === null || a.length < 10 || b.length < 10) return false
      return Math.abs(daysBetween(a, b)) <= (c.days ?? 0)
    }
    case 'includes':
    case 'not-includes':
      return Array.isArray(left.value) && (left.value as unknown[]).includes(right.value) === (c.op === 'includes')
    case 'includes-any':
      return Array.isArray(left.value) && rights.some(r => (left.value as unknown[]).includes(r.value))
    case 'includes-all':
      return Array.isArray(left.value) && rights.every(r => (left.value as unknown[]).includes(r.value))
    case 'count-at-least': {
      const n = number(right)
      return Array.isArray(left.value) && n !== null && left.value.length >= n
    }
  }
  return false
}

export function holds(condition: Condition, scope: Scope): boolean {
  if ('all' in condition) return condition.all.every(c => holds(c, scope))
  if ('any' in condition) return condition.any.some(c => holds(c, scope))
  if ('none' in condition) return !condition.none.some(c => holds(c, scope))
  return compare(condition, scope)
}
