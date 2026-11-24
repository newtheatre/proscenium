// Formula columns (rules B3 to B5, B7): + − × ÷, brackets, whole numbers and earlier columns by
// position (C1, C2). Parsed when a report is saved, refused with the position of the fault, and
// worked out by this one module on the server and in the browser, so a copy and the page agree.

export type Unit = 'count' | 'money' | 'minutes' | 'percent'
export type Combine = 'sum' | 'distinct' | 'level'

export type Formula
  = | { kind: 'number', value: number }
    | { kind: 'column', index: number }
    | { kind: 'op', op: '+' | '-' | '*' | '/', left: Formula, right: Formula }

/** Why a formula was refused, and where: `at` counts characters from 1. */
export class FormulaError extends Error {
  constructor(readonly code: string, readonly at: number) {
    super(code)
    this.name = 'FormulaError'
  }
}

const OPERATORS: Record<string, '+' | '-' | '*' | '/'> = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '/': '/', '÷': '/' }
const MAX_LENGTH = 200 // not-policy: a formula is a line, not a program
const MAX_NUMBER = 1_000_000 // not-policy: no constant in a report needs more

type Token = { kind: 'number', value: number, at: number } | { kind: 'column', index: number, at: number } | { kind: 'op', op: '+' | '-' | '*' | '/', at: number } | { kind: '(' | ')', at: number }

function readNumber(text: string, i: number): [Token, number] {
  const at = i + 1
  const digits = /^\d+/.exec(text.slice(i))![0]
  if (text[i + digits.length] === '.' || text[i + digits.length] === ',') throw new FormulaError('whole-numbers', at + digits.length)
  const value = Number(digits)
  if (value > MAX_NUMBER) throw new FormulaError('number-too-large', at)
  return [{ kind: 'number', value, at }, digits.length]
}

function readColumn(text: string, i: number): [Token, number] {
  const at = i + 1
  const digits = /^\d+/.exec(text.slice(i + 1))?.[0]
  if (!digits) throw new FormulaError('column-number', at)
  return [{ kind: 'column', index: Number(digits) - 1, at }, 1 + digits.length]
}

/** The token starting at `i` and how many characters it takes; null for white space. */
function readToken(text: string, i: number): [Token | null, number] {
  const c = text[i]!
  const at = i + 1
  if (/\s/.test(c)) return [null, 1]
  if (OPERATORS[c]) return [{ kind: 'op', op: OPERATORS[c], at }, 1]
  if (c === '(' || c === ')') return [{ kind: c, at }, 1]
  if (/\d/.test(c)) return readNumber(text, i)
  if (c === 'C' || c === 'c') return readColumn(text, i)
  throw new FormulaError('unknown-character', at)
}

function tokens(text: string): Token[] {
  if (text.length > MAX_LENGTH) throw new FormulaError('too-long', MAX_LENGTH)
  const out: Token[] = []
  let i = 0
  while (i < text.length) {
    const [token, length] = readToken(text, i)
    if (token) out.push(token)
    i += length
  }
  return out
}

/**
 * Parses a formula for the column at `position` (0-based), which may name only earlier columns.
 * Throws FormulaError naming the fault and its place.
 */
export function parseFormula(text: string, position: number): Formula {
  const list = tokens(text)
  if (!list.length) throw new FormulaError('empty', 1)
  let i = 0
  const end = text.length + 1
  const peek = () => list[i]
  const expression = (): Formula => {
    let left = term()
    while (peek()?.kind === 'op' && ['+', '-'].includes((peek() as { op: string }).op)) {
      const op = (list[i++] as { op: '+' | '-' }).op
      left = { kind: 'op', op, left, right: term() }
    }
    return left
  }
  const term = (): Formula => {
    let left = factor()
    while (peek()?.kind === 'op' && ['*', '/'].includes((peek() as { op: string }).op)) {
      const op = (list[i++] as { op: '*' | '/' }).op
      left = { kind: 'op', op, left, right: factor() }
    }
    return left
  }
  const factor = (): Formula => {
    const t = list[i++]
    if (!t) throw new FormulaError('ends-early', end)
    if (t.kind === 'number') return { kind: 'number', value: t.value }
    if (t.kind === 'column') {
      if (t.index < 0 || t.index >= position) throw new FormulaError(t.index >= position ? 'later-column' : 'column-number', t.at)
      return { kind: 'column', index: t.index }
    }
    if (t.kind === '(') {
      const inner = expression()
      if (list[i]?.kind !== ')') throw new FormulaError('unclosed-bracket', list[i]?.at ?? end)
      i++
      return inner
    }
    throw new FormulaError('expected-value', t.at)
  }
  const formula = expression()
  if (i < list.length) throw new FormulaError('unexpected', list[i]!.at)
  if (!mentionsColumn(formula)) throw new FormulaError('no-column', 1)
  return formula
}

const mentionsColumn = (f: Formula): boolean => f.kind === 'column' || (f.kind === 'op' && (mentionsColumn(f.left) || mentionsColumn(f.right)))

/** What a column is, for checking units: its unit and how it combines. */
export interface ColumnKind { unit: Unit, combine: Combine }

type Walked = { unit: Unit | 'number', addable: boolean }

function addUnits(l: Walked, r: Walked): Walked {
  if (!l.addable || !r.addable) throw new FormulaError('not-addable', 1)
  if (l.unit !== r.unit || l.unit === 'percent') throw new FormulaError('units-differ', 1)
  return l
}

function multiplyUnits(l: Walked, r: Walked): Walked {
  if (l.unit === 'number') return r
  if (r.unit === 'number') return l
  throw new FormulaError('units-multiply', 1)
}

function divideUnits(l: Walked, r: Walked): Walked {
  if (r.unit === 'number') return l
  if (r.unit === 'count' && (l.unit === 'money' || l.unit === 'minutes')) return { unit: l.unit, addable: true }
  if (l.unit === 'count' && r.unit === 'count') return { unit: 'percent', addable: false }
  throw new FormulaError('units-divide', 1)
}

function walkUnits(f: Formula, columns: ColumnKind[]): Walked {
  if (f.kind === 'number') return { unit: 'number', addable: true }
  if (f.kind === 'column') return { unit: columns[f.index]!.unit, addable: columns[f.index]!.combine === 'sum' }
  const l = walkUnits(f.left, columns)
  const r = walkUnits(f.right, columns)
  if (f.op === '+' || f.op === '-') return addUnits(l, r)
  return f.op === '*' ? multiplyUnits(l, r) : divideUnits(l, r)
}

/**
 * The unit a formula gives (B4), or a FormulaError: money with money only, money ÷ count is money
 * per item, count ÷ count a percent; a distinct or level column may be divided but never added.
 */
export function formulaUnit(formula: Formula, columns: ColumnKind[]): Unit {
  const { unit } = walkUnits(formula, columns)
  if (unit === 'number') throw new FormulaError('no-column', 1)
  return unit
}

/** A cell's value for working out: a number (minor units for money, with its currency), or nothing. */
export interface Value { value: number, currency?: string }

/**
 * Works a formula out from one row's (or the totals row's) values (B5). Nothing where a column has
 * no value, where money in two currencies meets, or where it divides by nought: shown as a dash.
 * Count ÷ count is a percent, and money comes out in whole minor units.
 */
export function evaluate(formula: Formula, values: (Value | null)[], columns: ColumnKind[]): Value | null {
  const walk = (f: Formula): Value | null => {
    if (f.kind === 'number') return { value: f.value }
    if (f.kind === 'column') return values[f.index] ?? null
    const l = walk(f.left)
    const r = walk(f.right)
    return l && r ? apply(f, l, r, columns) : null
  }
  const out = walk(formula)
  return out && out.currency ? { ...out, value: Math.round(out.value) } : out
}

const ARITHMETIC = {
  '+': (a: number, b: number) => a + b,
  '-': (a: number, b: number) => a - b,
  '*': (a: number, b: number) => a * b,
  '/': (a: number, b: number) => a / b,
}

function apply(f: Extract<Formula, { kind: 'op' }>, l: Value, r: Value, columns: ColumnKind[]): Value | null {
  if (l.currency && r.currency && l.currency !== r.currency) return null
  const currency = f.op === '/' && l.currency && r.currency ? undefined : l.currency ?? r.currency
  const money = currency ? { currency } : {}
  if (f.op === '/' && r.value === 0) return null
  const share = f.op === '/' && walkUnits(f.left, columns).unit === 'count' && walkUnits(f.right, columns).unit === 'count'
  return { value: ARITHMETIC[f.op](l.value, r.value) * (share ? 100 : 1), ...money } // not-policy: a fraction as a percent
}

/** The formula in words for its tooltip ("Bar takings ÷ Tickets sold"), naming columns by their labels. */
export function formulaWords(formula: Formula, labels: string[]): string {
  const SYMBOLS = { '+': '+', '-': '−', '*': '×', '/': '÷' }
  const walk = (f: Formula, outer?: '+' | '-' | '*' | '/'): string => {
    if (f.kind === 'number') return String(f.value)
    if (f.kind === 'column') return labels[f.index] ?? `C${f.index + 1}`
    const text = `${walk(f.left, f.op)} ${SYMBOLS[f.op]} ${walk(f.right, f.op)}`
    const loose = (f.op === '+' || f.op === '-') && (outer === '*' || outer === '/')
    return loose ? `(${text})` : text
  }
  return walk(formula)
}
