// Calculated values: an expression tree over a fixed list of functions (part 3). Nothing here reads
// the clock, the network or randomness, so the same answers always give the same value.
import type { Calculation, Entry, Expression } from './types'
import type { Scope } from './conditions'
import { holds, resolve } from './conditions'
import type { Fraction } from './values'
import { addDays, daysBetween, fAdd, fCompare, fDiv, fMul, fNumber, fRound, fSub, fraction, isDate, isDateTime, isEmpty } from './values'

type Worked = Fraction | string | null
const isFraction = (v: Worked): v is Fraction => v !== null && typeof v === 'object'

function leaf(value: unknown): Worked {
  if (typeof value === 'number') return fraction(value)
  if (typeof value === 'string' && value.trim() !== '') return value
  return null
}

function work(e: Expression, scope: Scope): Worked {
  if (!('fn' in e)) return leaf(resolve(e, scope).value)
  if (e.fn === 'count') {
    const entries = scope.answers[e.group]
    return fraction(Array.isArray(entries) ? entries.length : 0)
  }
  if (e.fn === 'sum') {
    const entries = scope.answers[e.group]
    let total: Fraction | null = fraction(0)
    for (const entry of (Array.isArray(entries) ? entries : []) as Entry[]) {
      const v = leaf((entry as Entry)?.[e.of])
      if (isFraction(v) && total) total = fAdd(total, v)
    }
    return total
  }
  if (e.fn === 'choose') return work(holds(e.when, scope) ? e.then : e.else, scope)

  const args = e.args.map(a => work(a, scope))
  if (args.some(a => a === null || isEmpty(a))) return null
  const numbers = args.filter(isFraction)
  const allNumbers = numbers.length === args.length
  switch (e.fn) {
    case 'add': return allNumbers ? numbers.reduce<Fraction | null>((a, b) => a && fAdd(a, b), fraction(0)) : null
    case 'multiply': return allNumbers ? numbers.reduce<Fraction | null>((a, b) => a && fMul(a, b), fraction(1)) : null
    case 'subtract': return allNumbers ? numbers.slice(1).reduce<Fraction | null>((a, b) => a && fSub(a, b), numbers[0]!) : null
    case 'divide': return allNumbers ? numbers.slice(1).reduce<Fraction | null>((a, b) => a && fDiv(a, b), numbers[0]!) : null
    case 'round': return allNumbers ? fRound(numbers[0]!, e.places ?? 0) : null
    case 'min':
    case 'max': {
      const want = e.fn === 'min' ? -1 : 1
      if (allNumbers) return numbers.reduce((a, b) => (fCompare(b, a) === want ? b : a))
      if (numbers.length) return null
      return (args as string[]).reduce((a, b) => ((b < a ? -1 : b > a ? 1 : 0) === want ? b : a))
    }
    case 'days-between': {
      const [from, to] = args
      const date = (v: Worked) => typeof v === 'string' && (isDate(v) || isDateTime(v))
      return date(from!) && date(to!) ? fraction(daysBetween(from as string, to as string)) : null
    }
    case 'add-days': {
      const [date, days] = args
      if (typeof date !== 'string' || !(isDate(date) || isDateTime(date)) || !isFraction(days!) || days.d !== 1) return null
      return addDays(date, days.n)
    }
    case 'join': return args.map(a => (isFraction(a) ? String(fNumber(a)) : a)).join('')
  }
  return null
}

/** The finished value of one calculation: money as whole minor units, rounded half up once. */
export function calculate(calculation: Calculation, scope: Scope): string | number | null {
  const worked = work(calculation.expression, scope)
  if (worked === null) return null
  if (calculation.type === 'money') {
    if (!isFraction(worked)) return null
    const whole = fRound(worked)
    return whole ? whole.n : null
  }
  if (calculation.type === 'number' || calculation.type === 'percent') return isFraction(worked) ? fNumber(worked) : null
  if (calculation.type === 'date') return typeof worked === 'string' && (isDate(worked) || isDateTime(worked)) ? worked : null
  return isFraction(worked) ? String(fNumber(worked)) : worked
}

/** Which calculations an expression reads, for ordering them and for finding a circle. */
export function calculationsRead(e: Expression, into = new Set<string>()): Set<string> {
  const ofCondition = (c: import('./types').Condition): void => {
    if ('all' in c) return c.all.forEach(ofCondition)
    if ('any' in c) return c.any.forEach(ofCondition)
    if ('none' in c) return c.none.forEach(ofCondition)
    for (const side of [c.left, ...(c.right === undefined ? [] : Array.isArray(c.right) ? c.right : [c.right])]) if ('calculation' in side) into.add(side.calculation)
  }
  if (!('fn' in e)) {
    if ('calculation' in e) into.add(e.calculation)
  }
  else if (e.fn === 'choose') {
    ofCondition(e.when)
    calculationsRead(e.then, into)
    calculationsRead(e.else, into)
  }
  else if ('args' in e) e.args.forEach(a => calculationsRead(a, into))
  return into
}
