// A calculation's formula as the builder shows it: rows, each a term and the sign that joins it to
// the row before ("Performing rights + Set and props × 2"). Multiplying and dividing are worked out
// before adding and subtracting, as on paper. The rows are turned into the engine's expression tree
// and back; a tree the rows cannot show (written in JSON with other functions) is left as it is.
import type { Expression, Operand } from '../engine/types'

export const OPERATIONS = ['add', 'subtract', 'multiply', 'divide'] as const
export type Operation = (typeof OPERATIONS)[number]

/** What one row reads: an answer, a total over a repeating group, how many entries a group has, another calculation, or a number. */
export type Term
  = | { answer: string }
    | { calculation: string }
    | { value: number }
    | { fn: 'sum', group: string, of: string }
    | { fn: 'count', group: string }

export interface FormulaRow {
  /** How this row joins the one before. The first row has none. */
  op?: Operation
  term: Term
}
export interface Formula {
  rows: FormulaRow[]
  /** An answer or calculation left empty counts as nothing (0), rather than leaving the result empty. */
  blankAsNothing: boolean
}

const ADDING: Operation[] = ['add', 'subtract']

/** Whether a term reads something that may be left empty, and so may be counted as nothing. */
const mayBeBlank = (term: Term): term is { answer: string } | { calculation: string } => 'answer' in term || 'calculation' in term

function termExpression(term: Term, blankAsNothing: boolean): Expression {
  const e = JSON.parse(JSON.stringify(term)) as Expression
  if (!blankAsNothing || !mayBeBlank(term)) return e
  return { fn: 'choose', when: { left: e as Operand, op: 'answered' }, then: e, else: { value: 0 } }
}

/** One step of the fold: the same operation again joins the list; another wraps what is there. */
function join(acc: Expression, op: Operation, next: Expression): Expression {
  if ('fn' in acc && acc.fn === op && 'args' in acc) return { fn: op, args: [...acc.args, next] }
  return { fn: op, args: [acc, next] }
}

/** The engine's expression for a formula. */
export function expressionOf(formula: Formula): Expression {
  const rows = formula.rows.length ? formula.rows : [{ term: { value: 0 } }]
  // Runs of rows joined by × and ÷ are worked out first, then joined by + and −.
  const parts: { op: Operation | undefined, rows: FormulaRow[] }[] = []
  rows.forEach((row, i) => {
    if (i === 0 || !row.op || ADDING.includes(row.op)) parts.push({ op: i === 0 ? undefined : (row.op ?? 'add'), rows: [row] })
    else parts.at(-1)!.rows.push(row)
  })
  const product = (part: FormulaRow[]): Expression => part.slice(1).reduce((acc, row) => join(acc, row.op!, termExpression(row.term, formula.blankAsNothing)), termExpression(part[0]!.term, formula.blankAsNothing))
  return parts.slice(1).reduce((acc, part) => join(acc, part.op!, product(part.rows)), product(parts[0]!.rows))
}

function atom(e: Expression): { term: Term, blank: boolean | null } | null {
  if (!('fn' in e)) {
    if ('answer' in e) return { term: { answer: e.answer }, blank: false }
    if ('calculation' in e) return { term: { calculation: e.calculation }, blank: false }
    if ('value' in e && typeof e.value === 'number') return { term: { value: e.value }, blank: null }
    return null
  }
  if (e.fn === 'sum') return { term: { fn: 'sum', group: e.group, of: e.of }, blank: null }
  if (e.fn === 'count') return { term: { fn: 'count', group: e.group }, blank: null }
  // "This answer, or nothing when it is empty".
  if (e.fn === 'choose') {
    const w = e.when
    const inner = atom(e.then)
    const same = 'left' in w && w.op === 'answered' && w.right === undefined && JSON.stringify(w.left) === JSON.stringify(e.then)
    const zero = !('fn' in e.else) && 'value' in e.else && e.else.value === 0
    if (same && zero && inner && mayBeBlank(inner.term)) return { term: inner.term, blank: true }
  }
  return null
}

type Read = { op?: Operation, term: Term, blank: boolean | null }[]

function multiplying(e: Expression): Read | null {
  if ('fn' in e && (e.fn === 'multiply' || e.fn === 'divide') && 'args' in e && e.args.length >= 2 && e.places === undefined) {
    const first = multiplying(e.args[0]!)
    if (!first) return null
    const rest = e.args.slice(1).map(atom)
    if (rest.some(r => r === null)) return null
    return [...first, ...rest.map(r => ({ op: e.fn as Operation, ...r! }))]
  }
  const one = atom(e)
  return one ? [one] : null
}

function adding(e: Expression): Read | null {
  if ('fn' in e && (e.fn === 'add' || e.fn === 'subtract') && 'args' in e && e.args.length >= 2 && e.places === undefined) {
    const first = adding(e.args[0]!)
    if (!first) return null
    const out = [...first]
    for (const arg of e.args.slice(1)) {
      const part = multiplying(arg)
      if (!part) return null
      out.push({ ...part[0]!, op: e.fn as Operation }, ...part.slice(1))
    }
    return out
  }
  return multiplying(e)
}

/** The rows of an expression, or null when the rows cannot show it (it is then edited as JSON). */
export function formulaOf(e: Expression): Formula | null {
  const read = adding(e)
  if (!read) return null
  const blanks = read.filter(r => r.blank !== null).map(r => r.blank)
  // Counting blanks as nothing is all or none: a mixture is edited as JSON.
  if (blanks.some(b => b) && blanks.some(b => !b)) return null
  const formula: Formula = { rows: read.map(({ op, term }, i) => (i === 0 ? { term } : { op: op ?? 'add', term })), blankAsNothing: blanks.some(b => b) }
  // Only rows that give back the same tree are rows; anything else stays as it was written.
  return JSON.stringify(expressionOf(formula)) === JSON.stringify(e) ? formula : null
}
