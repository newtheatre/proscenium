// The engine's own rules, beyond the shared case set: reading a definition (FB-101), each
// comparison (FB-102), routing (FB-103), calculations (FB-104), rules (FB-105) and the checks
// before publishing ("No way back").
import { describe, expect, it } from 'vitest'
import { checkDefinition, evaluate, issuesOnPage, nextStep, parseDefinition, publishable } from '../../shared/engine'
import type { Answers, Comparison, Condition, Definition, Item, Question } from '../../shared/engine'

const today = '2026-11-17'
const q = (id: string, type: Question['type'], more: Partial<Question> = {}): Question => ({ kind: 'question', id, key: id, type, label: id, dataClass: 'internal', ...more })
const form = (items: Item[], more: Partial<Definition> = {}): Definition => ({ format: 1, pages: [{ id: 'p', title: 'Page', items }], ...more })
const colours = [{ id: 'r', label: 'Red' }, { id: 'g', label: 'Green' }, { id: 'b', label: 'Blue' }]

/** Whether a question shown by `when` is visible with these answers. */
function shown(items: Question[], when: Condition, answers: Answers, facts = {}): boolean {
  const def = form([...items, q('target', 'text.short', { visibleWhen: when })])
  return evaluate(def, answers, { today, facts }).visible.target!
}

describe('reading a definition', () => {
  it('accepts a definition that matches the format', () => {
    expect(parseDefinition(form([q('a', 'text.short')]))).toMatchObject({ ok: true })
  })
  it('refuses a missing part and an unknown question type, with the path to the fault', () => {
    const missing = parseDefinition({ format: 1 })
    expect(missing).toMatchObject({ ok: false, faults: [{ path: ['pages'], code: 'format' }] })
    const unknown = parseDefinition(form([{ ...q('a', 'text.short'), type: 'colour' as never }]))
    expect(unknown.ok).toBe(false)
    expect(!unknown.ok && unknown.faults[0]!.path).toEqual(['pages', 0, 'items', 0, 'type'])
  })
  it('refuses a key it does not know, so nothing unread is ever stored', () => {
    expect(parseDefinition(form([{ ...q('a', 'text.short'), script: 'alert(1)' } as never])).ok).toBe(false)
  })
  it('refuses another format', () => {
    expect(parseDefinition({ ...form([]), format: 2 }).ok).toBe(false)
  })
  it('refuses an id or a key used twice, and an option id used twice', () => {
    const twice = parseDefinition(form([q('a', 'text.short'), q('a', 'number', { key: 'other' }), q('b', 'number', { key: 'other' })]))
    expect(!twice.ok && twice.faults.map(f => f.code)).toEqual(['duplicate-id', 'duplicate-key'])
    const options = parseDefinition(form([q('a', 'choice.single', { options: [{ id: 'x', label: 'One' }, { id: 'x', label: 'Two' }] })]))
    expect(!options.ok && options.faults[0]).toMatchObject({ code: 'duplicate-id', path: ['pages', 0, 'items', 0, 'options', 1, 'id'] })
  })
  it('keeps the option id "other" for the Other answer', () => {
    expect(parseDefinition(form([q('a', 'choice.single', { options: [{ id: 'other', label: 'Other' }] })])).ok).toBe(false)
  })
  it('refuses a definition over a limit, naming the limit', () => {
    const limits = { questions: 2, pages: 1, definitionBytes: 100000, repeatEntries: 5, conditionDepth: 1 }
    const many = parseDefinition(form([q('a', 'number'), q('b', 'number'), q('c', 'number')]), limits)
    expect(!many.ok && many.faults.map(f => f.limit)).toEqual(['questions'])
    const pages = parseDefinition({ format: 1, pages: [{ id: 'p', title: 'One', items: [] }, { id: 'p2', title: 'Two', items: [] }] }, limits)
    expect(!pages.ok && pages.faults.map(f => f.limit)).toEqual(['pages'])
    const deep = parseDefinition(form([q('a', 'number', { visibleWhen: { all: [{ any: [{ left: { answer: 'a' }, op: 'answered' }] }] } })]), limits)
    expect(!deep.ok && deep.faults.map(f => f.limit)).toEqual(['conditionDepth'])
    const big = parseDefinition(form([q('a', 'number')]), { ...limits, definitionBytes: 50 })
    expect(!big.ok && big.faults.map(f => f.limit)).toEqual(['definitionBytes'])
    const entries = parseDefinition(form([{ kind: 'group', id: 'g', key: 'g', label: 'Group', max: 6, items: [q('a', 'number')] }]), limits)
    expect(!entries.ok && entries.faults.map(f => f.limit)).toEqual(['repeatEntries'])
  })
})

describe('comparisons', () => {
  const text = [q('t', 'text.short')]
  const number = [q('n', 'number')]
  const date = [q('d', 'date')]
  const one = [q('c', 'choice.single', { options: colours })]
  const many = [q('m', 'choice.multiple', { options: colours })]
  const c = (left: string, op: Comparison['op'], right?: Comparison['right'], days?: number): Comparison => ({ left: { answer: left }, op, ...(right === undefined ? {} : { right }), ...(days === undefined ? {} : { days }) })
  const v = (value: string | number | boolean) => ({ value })

  it('text: is, is not, contains, does not contain, starts with', () => {
    expect(shown(text, c('t', 'is', v('hello')), { t: ' Hello ' })).toBe(true)
    expect(shown(text, c('t', 'is-not', v('hello')), { t: 'HELLO' })).toBe(false)
    expect(shown(text, c('t', 'contains', v('ELL')), { t: 'hello' })).toBe(true)
    expect(shown(text, c('t', 'not-contains', v('x')), { t: 'hello' })).toBe(true)
    expect(shown(text, c('t', 'starts-with', v('he')), { t: 'Hello' })).toBe(true)
    expect(shown(text, c('t', 'starts-with', v('lo')), { t: 'Hello' })).toBe(false)
  })
  it('numbers: each bound at its boundary', () => {
    expect(shown(number, c('n', 'more-than', v(5)), { n: 5 })).toBe(false)
    expect(shown(number, c('n', 'at-least', v(5)), { n: 5 })).toBe(true)
    expect(shown(number, c('n', 'less-than', v(5)), { n: 5 })).toBe(false)
    expect(shown(number, c('n', 'at-most', v(5)), { n: 5 })).toBe(true)
    expect(shown(number, c('n', 'between', [v(1), v(5)]), { n: 5 })).toBe(true)
    expect(shown(number, c('n', 'between', [v(1), v(5)]), { n: 5.01 })).toBe(false)
    expect(shown(number, c('n', 'is', v(0)), { n: 0 })).toBe(true)
  })
  it('a number is never compared with text', () => {
    expect(shown(number, c('n', 'is', v('5')), { n: 5 })).toBe(false)
    expect(shown(number, c('n', 'more-than', v('1')), { n: 5 })).toBe(false)
    expect(shown(text, c('t', 'more-than', v(1)), { t: '5' })).toBe(false)
  })
  it('dates: before, after, on or before, on or after, within days, and today', () => {
    expect(shown(date, c('d', 'before', v('2026-12-01')), { d: '2026-11-30' })).toBe(true)
    expect(shown(date, c('d', 'before', v('2026-12-01')), { d: '2026-12-01' })).toBe(false)
    expect(shown(date, c('d', 'on-or-before', v('2026-12-01')), { d: '2026-12-01' })).toBe(true)
    expect(shown(date, c('d', 'after', { today: true }), { d: '2026-11-18' })).toBe(true)
    expect(shown(date, c('d', 'on-or-after', { today: true }), { d: '2026-11-16' })).toBe(false)
    expect(shown(date, c('d', 'within-days', { today: true }, 7), { d: '2026-11-24' })).toBe(true)
    expect(shown(date, c('d', 'within-days', { today: true }, 7), { d: '2026-11-25' })).toBe(false)
    expect(shown(date, c('d', 'within-days', { today: true }, 7), { d: '2026-11-10' })).toBe(true)
  })
  it('one choice: is, is not, is any of', () => {
    expect(shown(one, c('c', 'is', { option: 'r' }), { c: 'r' })).toBe(true)
    expect(shown(one, c('c', 'is-not', { option: 'r' }), { c: 'g' })).toBe(true)
    expect(shown(one, c('c', 'any-of', [{ option: 'r' }, { option: 'g' }]), { c: 'g' })).toBe(true)
    expect(shown(one, c('c', 'any-of', [{ option: 'r' }, { option: 'g' }]), { c: 'b' })).toBe(false)
  })
  it('several choices: includes, does not include, any of, all of, at least n', () => {
    const a = { m: ['r', 'g'] }
    expect(shown(many, c('m', 'includes', { option: 'r' }), a)).toBe(true)
    expect(shown(many, c('m', 'not-includes', { option: 'b' }), a)).toBe(true)
    expect(shown(many, c('m', 'includes-any', [{ option: 'b' }, { option: 'g' }]), a)).toBe(true)
    expect(shown(many, c('m', 'includes-all', [{ option: 'b' }, { option: 'g' }]), a)).toBe(false)
    expect(shown(many, c('m', 'count-at-least', v(2)), a)).toBe(true)
    expect(shown(many, c('m', 'count-at-least', v(3)), a)).toBe(false)
  })
  it('an empty answer makes every comparison false, except "is empty" and "is not"', () => {
    for (const empty of [{}, { t: '' }, { t: '   ' }]) {
      expect(shown(text, c('t', 'is', v('x')), empty)).toBe(false)
      expect(shown(text, c('t', 'contains', v('x')), empty)).toBe(false)
      expect(shown(text, c('t', 'not-contains', v('x')), empty)).toBe(false)
      expect(shown(text, c('t', 'answered'), empty)).toBe(false)
      expect(shown(text, c('t', 'empty'), empty)).toBe(true)
      expect(shown(text, c('t', 'is-not', v('x')), empty)).toBe(true)
    }
    expect(shown(many, c('m', 'not-includes', { option: 'r' }), { m: [] })).toBe(false)
    expect(shown([q('y', 'yesno')], c('y', 'answered'), { y: false })).toBe(true)
  })
  it('groups: all, any and none, nested', () => {
    const yes = c('n', 'at-least', v(1))
    const no = c('n', 'at-least', v(100))
    const a = { n: 5 }
    expect(shown(number, { all: [yes, no] }, a)).toBe(false)
    expect(shown(number, { any: [yes, no] }, a)).toBe(true)
    expect(shown(number, { none: [no] }, a)).toBe(true)
    expect(shown(number, { none: [yes, no] }, a)).toBe(false)
    expect(shown(number, { all: [yes, { any: [no, { none: [no] }] }] }, a)).toBe(true)
  })
  it('facts come from the server\'s context, and a missing one is empty', () => {
    const member: Comparison = { left: { fact: 'core.member' }, op: 'is', right: v(true) }
    expect(shown([], member, {}, { 'core.member': true })).toBe(true)
    expect(shown([], member, {}, {})).toBe(false)
    expect(shown([], member, { 'core.member': true } as Answers, {})).toBe(false)
  })
})

describe('visibility', () => {
  it('everything inside a hidden page is hidden, and a hidden answer is empty to what depends on it', () => {
    const def: Definition = { format: 1, pages: [
      { id: 'p1', title: 'One', items: [q('gate', 'yesno'), q('a', 'text.short', { visibleWhen: { left: { answer: 'gate' }, op: 'is', right: { value: true } } }), q('b', 'text.short', { visibleWhen: { left: { answer: 'a' }, op: 'answered' } })] },
      { id: 'p2', title: 'Two', visibleWhen: { left: { answer: 'b' }, op: 'answered' }, items: [q('c', 'text.short', { required: true })] },
    ] }
    const hidden = evaluate(def, { gate: false, a: 'kept back', b: 'so is this', c: 'and this' }, { today })
    expect(hidden.visible).toEqual({ p1: true, gate: true, a: false, b: false, p2: false, c: false })
    expect(hidden.answers).toEqual({ gate: false })
    expect(hidden.valid).toBe(true)
    const open = evaluate(def, { gate: true, a: 'x', b: 'y' }, { today })
    expect(open.visible.c).toBe(true)
    expect(open.issues).toEqual({ c: [{ rule: 'required' }] })
  })
  it('rules on a hidden question never run', () => {
    const def = form([q('gate', 'yesno'), q('a', 'text.short', { required: true, visibleWhen: { left: { answer: 'gate' }, op: 'is', right: { value: true } }, validation: [{ rule: 'minLength', value: 10 }] })])
    expect(evaluate(def, { gate: false, a: 'short' }, { today }).issues).toEqual({})
  })
})

describe('routing', () => {
  const def: Definition = {
    format: 1,
    pages: [
      { id: 'a', title: 'A', items: [q('pick', 'choice.single', { options: colours })], routes: [
        { when: { left: { answer: 'pick' }, op: 'is', right: { option: 'r' } }, to: { page: 'c' } },
        { when: { left: { answer: 'pick' }, op: 'any-of', right: [{ option: 'r' }, { option: 'g' }] }, to: { ending: 'stop' } },
        { when: { left: { answer: 'pick' }, op: 'is', right: { option: 'b' } }, to: { ending: 'done' } },
      ] },
      { id: 'b', title: 'B', items: [q('qb', 'text.short', { required: true })] },
      { id: 'c', title: 'C', items: [q('qc', 'text.short')] },
    ],
    endings: [{ id: 'stop', title: 'Not this time', submits: false }, { id: 'done', title: 'Thanks', submits: true }],
  }
  it('takes the first route whose condition holds', () => {
    const e = evaluate(def, { pick: 'r' }, { today })
    expect(e.route).toEqual(['a', 'c'])
    expect(e.visible.b).toBe(false)
    expect(nextStep(e, 'a')).toEqual({ page: 'c' })
    expect(nextStep(e, 'c')).toEqual({ submit: true })
  })
  it('with no route, goes to the next page', () => {
    const e = evaluate(def, {}, { today })
    expect(e.route).toEqual(['a', 'b', 'c'])
    expect(issuesOnPage(def, e, 'a')).toEqual({})
    expect(issuesOnPage(def, e, 'b')).toEqual({ qb: [{ rule: 'required' }] })
  })
  it('ends early at an ending, which says whether anything is stored', () => {
    const stop = evaluate(def, { pick: 'g', qb: 'left over' }, { today })
    expect(stop.route).toEqual(['a'])
    expect(stop.ending).toMatchObject({ id: 'stop', submits: false })
    expect(stop.answers).toEqual({ pick: 'g' })
    expect(nextStep(stop, 'a')).toMatchObject({ ending: { id: 'stop' } })
    expect(evaluate(def, { pick: 'b' }, { today }).ending).toMatchObject({ id: 'done', submits: true })
  })
  it('never goes back, even if a draft says to', () => {
    const back: Definition = { format: 1, pages: [{ id: 'a', title: 'A', items: [] }, { id: 'b', title: 'B', items: [], routes: [{ when: { left: { today: true }, op: 'answered' }, to: { page: 'a' } }] }] }
    expect(evaluate(back, {}, { today }).route).toEqual(['a', 'b'])
  })
})

describe('calculations', () => {
  const calc = (expression: NonNullable<Definition['calculations']>[number]['expression'], type: 'number' | 'money' | 'date' | 'text', answers: Answers, items: Item[] = [q('a', 'number'), q('b', 'number'), q('m', 'money'), q('d', 'date'), q('e', 'date'), q('t', 'text.short')]) =>
    evaluate(form(items, { calculations: [{ id: 'c', key: 'c', type, expression }] }), answers, { today }).calculated.c
  const a = { answer: 'a' }
  const b = { answer: 'b' }

  it('add, subtract, multiply, divide', () => {
    expect(calc({ fn: 'add', args: [a, b, { value: 1 }] }, 'number', { a: 0.1, b: 0.2 })).toBe(1.3)
    expect(calc({ fn: 'subtract', args: [a, b] }, 'number', { a: 5, b: 7 })).toBe(-2)
    expect(calc({ fn: 'multiply', args: [a, b] }, 'number', { a: 1.5, b: 4 })).toBe(6)
    expect(calc({ fn: 'divide', args: [a, b] }, 'number', { a: 1, b: 4 })).toBe(0.25)
    expect(calc({ fn: 'divide', args: [a, b] }, 'number', { a: 1, b: 0 })).toBe(null)
  })
  it('money never leaves whole minor units, and a division rounds half up once', () => {
    const m = { answer: 'm' }
    expect(calc({ fn: 'divide', args: [m, { value: 3 }] }, 'money', { m: 1000 })).toBe(333)
    expect(calc({ fn: 'divide', args: [m, { value: 3 }] }, 'money', { m: 2000 })).toBe(667)
    expect(calc({ fn: 'divide', args: [m, { value: 2 }] }, 'money', { m: 5 })).toBe(3)
    // A third of £10, three times, is £10 again: nothing was rounded on the way.
    expect(calc({ fn: 'multiply', args: [{ fn: 'divide', args: [m, { value: 3 }] }, { value: 3 }] }, 'money', { m: 1000 })).toBe(1000)
    expect(calc({ fn: 'multiply', args: [m, { value: 0.175 }] }, 'money', { m: 1000 })).toBe(175)
    expect(calc({ fn: 'multiply', args: [m, { value: 0.2 }] }, 'money', { m: 1999 })).toBe(400)
  })
  it('round, minimum and maximum', () => {
    expect(calc({ fn: 'round', args: [a], places: 1 }, 'number', { a: 2.25 })).toBe(2.3)
    expect(calc({ fn: 'round', args: [a] }, 'number', { a: -2.5 })).toBe(-2)
    expect(calc({ fn: 'min', args: [a, b] }, 'number', { a: 3, b: 2 })).toBe(2)
    expect(calc({ fn: 'max', args: [a, b] }, 'number', { a: 3, b: 2 })).toBe(3)
    expect(calc({ fn: 'max', args: [{ answer: 'd' }, { answer: 'e' }] }, 'date', { d: '2026-01-31', e: '2026-02-01' })).toBe('2026-02-01')
  })
  it('days between two dates and days added to a date, across a month, a leap day and a clock change', () => {
    expect(calc({ fn: 'days-between', args: [{ answer: 'd' }, { answer: 'e' }] }, 'number', { d: '2028-02-28', e: '2028-03-01' })).toBe(2)
    expect(calc({ fn: 'days-between', args: [{ answer: 'd' }, { answer: 'e' }] }, 'number', { d: '2026-10-24', e: '2026-10-26' })).toBe(2)
    expect(calc({ fn: 'add-days', args: [{ answer: 'd' }, { value: 30 }] }, 'date', { d: '2027-01-31' })).toBe('2027-03-02')
    expect(calc({ fn: 'add-days', args: [{ today: true }, { value: -1 }] }, 'date', {})).toBe('2026-11-16')
  })
  it('choose by a condition, and join text', () => {
    expect(calc({ fn: 'choose', when: { left: a, op: 'more-than', right: { value: 10 } }, then: { value: 'big' }, else: { value: 'small' } }, 'text', { a: 11 })).toBe('big')
    expect(calc({ fn: 'join', args: [{ answer: 't' }, { value: ' x' }, a] }, 'text', { t: 'Row', a: 3 })).toBe('Row x3')
  })
  it('an empty input makes the result empty', () => {
    expect(calc({ fn: 'add', args: [a, b] }, 'number', { a: 1 })).toBe(null)
    expect(calc({ fn: 'join', args: [{ answer: 't' }, { value: '!' }] }, 'text', {})).toBe(null)
  })
  it('a hidden answer is empty to a calculation', () => {
    const items = [q('gate', 'yesno'), q('a', 'number', { visibleWhen: { left: { answer: 'gate' }, op: 'is', right: { value: true } } }), q('b', 'number')]
    expect(calc({ fn: 'add', args: [a, b] }, 'number', { gate: false, a: 1, b: 2 }, items)).toBe(null)
    expect(calc({ fn: 'add', args: [a, b] }, 'number', { gate: true, a: 1, b: 2 }, items)).toBe(3)
  })
  it('one calculation may read another, and a circle in a draft is empty and does not hang', () => {
    const def = form([q('a', 'number')], { calculations: [
      { id: 'double', key: 'double', type: 'number', expression: { fn: 'multiply', args: [{ calculation: 'plus' }, { value: 2 }] } },
      { id: 'plus', key: 'plus', type: 'number', expression: { fn: 'add', args: [{ answer: 'a' }, { value: 1 }] } },
      { id: 'x', key: 'x', type: 'number', expression: { fn: 'add', args: [{ calculation: 'y' }, { value: 1 }] } },
      { id: 'y', key: 'y', type: 'number', expression: { fn: 'add', args: [{ calculation: 'x' }, { value: 1 }] } },
    ] })
    expect(evaluate(def, { a: 4 }, { today }).calculated).toEqual({ double: 10, plus: 5, x: null, y: null })
  })
})

describe('answers by type', () => {
  const issue = (question: Question, value: unknown, more: Answers = {}) => evaluate(form([question]), { [question.id]: value as never, ...more }, { today }).issues[question.id]?.[0]?.rule
  it('email, phone and web address', () => {
    expect(issue(q('a', 'email'), 'name@example.com')).toBeUndefined()
    expect(issue(q('a', 'email'), 'name@example')).toBe('type')
    expect(issue(q('a', 'phone'), '+44 (0)115 846 8777')).toBeUndefined()
    expect(issue(q('a', 'phone'), 'call me')).toBe('type')
    expect(issue(q('a', 'url'), 'https://example.com/show')).toBeUndefined()
    expect(issue(q('a', 'url'), 'javascript:alert(1)')).toBe('type')
  })
  it('dates and times', () => {
    expect(issue(q('a', 'date'), '2028-02-29')).toBeUndefined()
    expect(issue(q('a', 'date'), '2027-02-29')).toBe('type')
    expect(issue(q('a', 'time'), '19:30')).toBeUndefined()
    expect(issue(q('a', 'time'), '24:00')).toBe('type')
    expect(issue(q('a', 'datetime'), '2027-02-10T19:30')).toBeUndefined()
    expect(issue(q('a', 'datetime'), '2027-02-10 19:30')).toBe('type')
  })
  it('rating and scale stay inside their ends', () => {
    expect(issue(q('a', 'rating'), 5)).toBeUndefined()
    expect(issue(q('a', 'rating'), 0)).toBe('type')
    expect(issue(q('a', 'scale', { scale: { min: 0, max: 10 } }), 0)).toBeUndefined()
    expect(issue(q('a', 'scale', { scale: { min: 0, max: 10 } }), 11)).toBe('type')
  })
  it('choices, a dropdown of several, a ranking and "Other"', () => {
    expect(issue(q('a', 'choice.dropdown', { options: colours, multiple: true }), ['r', 'b'])).toBeUndefined()
    expect(issue(q('a', 'choice.dropdown', { options: colours }), ['r'])).toBe('option')
    expect(issue(q('a', 'choice.ranking', { options: colours }), ['b', 'r', 'g'])).toBeUndefined()
    expect(issue(q('a', 'choice.ranking', { options: colours }), ['b', 'r'])).toBe('option')
    expect(issue(q('a', 'choice.multiple', { options: colours }), ['r', 'other'])).toBe('option')
    expect(issue(q('a', 'choice.multiple', { options: colours, allowOther: true }), ['r', 'other'])).toBe('other')
    expect(issue(q('a', 'choice.multiple', { options: colours, allowOther: true }), ['r', 'other'], { 'a:other': 'Teal' })).toBeUndefined()
  })
  it('a record, an address and files', () => {
    expect(issue(q('a', 'record', { source: 'core.person' }), 'acc_1')).toBeUndefined()
    expect(issue(q('a', 'record', { source: 'core.person', multiple: true }), ['acc_1', 'acc_2'])).toBeUndefined()
    expect(issue(q('a', 'record', { source: 'core.person' }), ['acc_1'])).toBe('type')
    expect(issue(q('a', 'address'), { line1: '1 Cherry Tree Walk', town: 'Nottingham', postcode: 'NG7 2RD' })).toBeUndefined()
    expect(issue(q('a', 'address'), { line1: '1 Cherry Tree Walk', town: '', postcode: 'NG7 2RD' })).toBe('type')
    const file = { id: 'fil_1', name: 'script.pdf', size: 2000, type: 'application/pdf' }
    const files = q('a', 'file', { validation: [{ rule: 'fileTypes', value: ['.pdf', 'image/*'] }, { rule: 'maxFileSize', value: 1500 }, { rule: 'maxFiles', value: 1 }] })
    expect(evaluate(form([files]), { a: [file, { ...file, name: 'notes.docx', type: 'application/msword' }] }, { today }).issues.a!.map(i => i.rule)).toEqual(['fileTypes', 'maxFileSize', 'maxFiles'])
    expect(issue(q('a', 'file', { validation: [{ rule: 'fileTypes', value: ['.pdf', 'image/*'] }] }), [{ ...file, name: 'poster.png', type: 'image/png' }])).toBeUndefined()
  })
  it('a named pattern, and the default when a rule has no message', () => {
    const postcode = q('a', 'text.short', { validation: [{ rule: 'pattern', value: 'postcode-uk' }] })
    expect(issue(postcode, 'ng7 2rd')).toBeUndefined()
    expect(evaluate(form([postcode]), { a: 'nowhere' }, { today }).issues.a).toEqual([{ rule: 'pattern', params: { pattern: 'postcode-uk' } }])
  })
  it('required by a condition', () => {
    const def = form([q('gate', 'yesno'), q('a', 'text.short', { required: { left: { answer: 'gate' }, op: 'is', right: { value: true } } })])
    expect(evaluate(def, { gate: true }, { today }).issues).toEqual({ a: [{ rule: 'required' }] })
    expect(evaluate(def, { gate: false }, { today }).issues).toEqual({})
  })
})

describe('the checks before publishing', () => {
  const codes = (def: Definition, options = {}) => checkDefinition(def, options).map(p => `${p.code}@${p.at}`)
  it('wording, options, sources and scales', () => {
    expect(codes(form([q('a', 'text.short', { label: ' ' }), q('b', 'choice.single'), q('c', 'choice.single', { options: [{ id: 'x', label: '' }] }), q('d', 'record'), q('e', 'record', { source: 'awards.type' }), q('f', 'scale')], {}), { sources: ['core.person'] }))
      .toEqual(['no-label@a', 'no-options@b', 'no-label@c', 'no-source@d', 'unknown-source@e', 'no-scale@f'])
  })
  it('a condition that refers to something missing, later, inside another group, or to an option that is not the question\'s', () => {
    const def: Definition = { format: 1, pages: [
      { id: 'p1', title: 'One', items: [
        q('a', 'text.short', { visibleWhen: { left: { answer: 'gone' }, op: 'answered' } }),
        q('b', 'text.short', { visibleWhen: { left: { answer: 'later' }, op: 'answered' } }),
        q('c', 'choice.single', { options: colours }),
        q('d', 'text.short', { visibleWhen: { left: { answer: 'c' }, op: 'is', right: { option: 'purple' } } }),
        q('e', 'text.short', { visibleWhen: { left: { answer: 'inner' }, op: 'answered' } }),
        { kind: 'group', id: 'g', key: 'g', label: 'Group', items: [q('inner', 'text.short'), q('sibling', 'text.short', { visibleWhen: { left: { answer: 'inner' }, op: 'answered' } })] },
        q('f', 'text.short', { visibleWhen: { left: { fact: 'made.up' }, op: 'answered' } }),
      ] },
      { id: 'p2', title: 'Two', items: [q('later', 'text.short')] },
    ] }
    expect(codes(def, { facts: ['core.member'] })).toEqual(['unknown-reference@a', 'later-reference@b', 'unknown-option@d', 'outside-group@e', 'unknown-fact@f'])
  })
  it('a comparison that does not suit the question, or is missing its other side', () => {
    const def = form([q('n', 'number'), q('m', 'choice.multiple', { options: colours }),
      q('a', 'text.short', { visibleWhen: { left: { answer: 'n' }, op: 'contains', right: { value: '1' } } }),
      q('b', 'text.short', { visibleWhen: { left: { answer: 'm' }, op: 'is', right: { option: 'r' } } }),
      q('c', 'text.short', { visibleWhen: { left: { answer: 'n' }, op: 'between', right: { value: 1 } } }),
      q('d', 'text.short', { visibleWhen: { left: { answer: 'n' }, op: 'at-least' } }),
    ])
    expect(codes(def)).toEqual(['wrong-comparison@a', 'wrong-comparison@b', 'incomplete-comparison@c', 'incomplete-comparison@d'])
  })
  it('no way back: a route to an earlier page, to itself or to nowhere', () => {
    const always: Condition = { left: { today: true }, op: 'answered' }
    const def: Definition = { format: 1, pages: [
      { id: 'a', title: 'A', items: [], routes: [{ when: always, to: { page: 'a' } }, { when: always, to: { ending: 'gone' } }] },
      { id: 'b', title: 'B', items: [], routes: [{ when: always, to: { page: 'a' } }, { when: always, to: { page: 'nowhere' } }] },
    ] }
    expect(codes(def)).toEqual(['route-back@a', 'unknown-target@a', 'route-back@b', 'unknown-target@b'])
    expect(publishable(checkDefinition(def))).toBe(false)
  })
  it('no way back: calculations in a circle, naming each of them', () => {
    const def = form([q('a', 'number')], { calculations: [
      { id: 'x', key: 'x', type: 'number', expression: { fn: 'add', args: [{ calculation: 'y' }, { value: 1 }] } },
      { id: 'y', key: 'y', type: 'number', expression: { fn: 'choose', when: { left: { calculation: 'z' }, op: 'answered' }, then: { value: 1 }, else: { value: 2 } } },
      { id: 'z', key: 'z', type: 'number', expression: { fn: 'add', args: [{ calculation: 'x' }, { answer: 'a' }] } },
      { id: 'fine', key: 'fine', type: 'number', expression: { fn: 'add', args: [{ calculation: 'x' }, { value: 1 }] } },
    ] })
    expect(codes(def).sort()).toEqual(['circular@x', 'circular@y', 'circular@z'])
  })
  it('what a calculation reads', () => {
    const def = form([q('t', 'text.short'), { kind: 'group', id: 'g', key: 'g', label: 'Group', items: [q('fee', 'money'), q('name', 'text.short')] }], { calculations: [
      { id: 'a', key: 'a', type: 'number', expression: { fn: 'add', args: [{ answer: 'missing' }, { answer: 'fee' }] } },
      { id: 'b', key: 'b', type: 'number', expression: { fn: 'sum', group: 'g', of: 'name' } },
      { id: 'c', key: 'c', type: 'number', expression: { fn: 'count', group: 'nope' } },
      { id: 'd', key: 'd', type: 'money', expression: { fn: 'sum', group: 'g', of: 'fee' } },
    ] })
    expect(codes(def)).toEqual(['unknown-reference@a', 'outside-group@a', 'not-a-number@b', 'unknown-reference@c'])
  })
  it('a rule that does not suit its question, and a pattern that could run away', () => {
    const def = form([
      q('a', 'number', { validation: [{ rule: 'minLength', value: 3 }] }),
      q('b', 'text.short', { validation: [{ rule: 'pattern', value: 'made-up' }] }),
      q('c', 'text.short', { validation: [{ rule: 'regex', value: '^(a+)+$' }] }),
      q('d', 'text.short', { validation: [{ rule: 'regex', value: '^[A-Z]{2}\\d{4}$' }] }),
    ])
    expect(codes(def)).toEqual(['wrong-rule@a', 'wrong-rule@b', 'wrong-rule@c', 'wrong-rule@d'])
    expect(codes(def, { allowRegex: true })).toEqual(['wrong-rule@a', 'wrong-rule@b', 'unsafe-pattern@c'])
  })
})
