// Calculations in the builder (FB-104): the formula rows and the expression tree they stand for,
// adding, labelling, placing and removing a calculation, and the problems a bad one shows.
import { describe, expect, it } from 'vitest'
import { addCalculation, calculationInputs, calculationsOn, changeCalculation, dependents, labelCalculation, moveCalculation, removeCalculation, removePage } from '../../shared/builder/edit'
import { expressionOf, formulaOf, type Formula } from '../../shared/builder/formula'
import { checkDefinition, evaluate, parseDefinition } from '../../shared/engine'
import type { Definition, Expression, Question } from '../../shared/engine'
import { SHIPPED_TEMPLATES } from '../../shared/templates'

const q = (id: string, type: Question['type'] = 'number', more: Partial<Question> = {}): Question => ({ kind: 'question', id, key: id, type, label: id, dataClass: 'internal', ...more })
const budget = (): Definition => ({ format: 1, pages: [
  { id: 'p1', title: 'One', items: [q('a'), q('b', 'money'), q('words', 'text.short'), { kind: 'group', id: 'g', key: 'g', label: 'Team', items: [q('fee', 'money'), q('name', 'text.short')] }] },
  { id: 'p2', title: 'Two', items: [q('c')] },
] })
const today = '2026-11-17'

describe('formula rows', () => {
  const round = (f: Formula) => formulaOf(expressionOf(f))

  it('a single term is itself', () => {
    expect(expressionOf({ rows: [{ term: { answer: 'a' } }], blankAsNothing: false })).toEqual({ answer: 'a' })
    expect(formulaOf({ answer: 'a' })).toEqual({ rows: [{ term: { answer: 'a' } }], blankAsNothing: false })
  })

  it('works out × and ÷ before + and −, as on paper', () => {
    const f: Formula = { rows: [{ term: { answer: 'a' } }, { op: 'add', term: { answer: 'b' } }, { op: 'multiply', term: { value: 2 } }, { op: 'subtract', term: { answer: 'c' } }], blankAsNothing: false }
    expect(expressionOf(f)).toEqual({ fn: 'subtract', args: [{ fn: 'add', args: [{ answer: 'a' }, { fn: 'multiply', args: [{ answer: 'b' }, { value: 2 }] }] }, { answer: 'c' }] })
    expect(round(f)).toEqual(f)
    const def = { ...budget(), calculations: [{ id: 'x', key: 'x', type: 'number' as const, expression: expressionOf(f) }] }
    expect(evaluate(def, { a: 1, b: 3, c: 4 }, { today }).calculated.x).toBe(3)
  })

  it('joins a run of the same sign into one list, and reads the template\'s total back as rows', () => {
    const f: Formula = { rows: ['a', 'b', 'c'].map((id, i) => (i ? { op: 'add' as const, term: { answer: id } } : { term: { answer: id } })), blankAsNothing: false }
    expect(expressionOf(f)).toEqual({ fn: 'add', args: [{ answer: 'a' }, { answer: 'b' }, { answer: 'c' }] })
    expect(round(f)).toEqual(f)
  })

  it('totals and counts a repeating group, divides, and reads another calculation', () => {
    const f: Formula = { rows: [{ term: { fn: 'sum', group: 'g', of: 'fee' } }, { op: 'divide', term: { fn: 'count', group: 'g' } }, { op: 'add', term: { calculation: 'other' } }], blankAsNothing: false }
    expect(round(f)).toEqual(f)
  })

  it('counts a blank as nothing when asked, for answers and calculations but not numbers', () => {
    const f: Formula = { rows: [{ term: { answer: 'a' } }, { op: 'add', term: { calculation: 'z' } }, { op: 'add', term: { value: 5 } }], blankAsNothing: true }
    const e = expressionOf(f) as { args: Expression[] }
    expect(e.args[0]).toEqual({ fn: 'choose', when: { left: { answer: 'a' }, op: 'answered' }, then: { answer: 'a' }, else: { value: 0 } })
    expect(e.args[2]).toEqual({ value: 5 })
    expect(round(f)).toEqual(f)
    const def = { ...budget(), calculations: [{ id: 'x', key: 'x', type: 'number' as const, expression: expressionOf({ ...f, rows: f.rows.slice(0, 1).concat(f.rows.slice(2)) }) }] }
    expect(evaluate(def, {}, { today }).calculated.x).toBe(5)
  })

  it('leaves alone what the rows cannot show', () => {
    const cannot: Expression[] = [
      { fn: 'round', args: [{ answer: 'a' }], places: 2 },
      { fn: 'multiply', args: [{ answer: 'a' }, { fn: 'add', args: [{ answer: 'b' }, { value: 1 }] }] },
      { fn: 'add', args: [{ answer: 'a' }, { fn: 'add', args: [{ answer: 'b' }, { answer: 'c' }] }] },
      { fn: 'add-days', args: [{ answer: 'a' }, { value: 1 }] },
      { value: 'text' },
      { fn: 'add', args: [{ fn: 'choose', when: { left: { answer: 'a' }, op: 'answered' }, then: { answer: 'a' }, else: { value: 0 } }, { answer: 'b' }] },
    ]
    for (const e of cannot) expect(formulaOf(e)).toBeNull()
  })
})

describe('editing calculations', () => {
  it('adds one with an id and key nothing else uses, on a page when asked', () => {
    const made = addCalculation(budget(), 'p2')
    const c = made.def.calculations![0]!
    expect(c).toMatchObject({ id: made.id, key: 'calculation', type: 'number', page: 'p2', expression: { value: 0 } })
    expect(parseDefinition(made.def).ok).toBe(true)
    expect(calculationsOn(made.def, 'p2').map(x => x.id)).toEqual([made.id])
    expect(addCalculation(made.def).def.calculations![1]!.key).toBe('calculation_2')
  })

  it('takes its key from its label until told not to', () => {
    const made = addCalculation(budget())
    const named = labelCalculation(made.def, made.id, 'Total budget', true)
    expect(named.calculations![0]).toMatchObject({ label: 'Total budget', key: 'total_budget' })
    expect(labelCalculation(named, made.id, 'Overall', false).calculations![0]).toMatchObject({ label: 'Overall', key: 'total_budget' })
  })

  it('changes, moves and removes one, never touching the definition it was given', () => {
    const first = addCalculation(budget())
    const second = addCalculation(first.def)
    const before = JSON.stringify(second.def)
    const changed = changeCalculation(second.def, first.id, (c) => { c.type = 'money' })
    expect(changed.calculations![0]!.type).toBe('money')
    expect(moveCalculation(second.def, second.id, -1).calculations!.map(c => c.id)).toEqual([second.id, first.id])
    expect(moveCalculation(second.def, second.id, 1)).toBe(second.def)
    expect(removeCalculation(removeCalculation(second.def, first.id), second.id).calculations).toBeUndefined()
    expect(JSON.stringify(second.def)).toBe(before)
  })

  it('shows nowhere once its page is removed', () => {
    const made = addCalculation(budget(), 'p2')
    expect(removePage(made.def, 'p2').calculations![0]!.page).toBeUndefined()
  })

  it('offers numbers to a formula: plain questions, a group\'s number questions and other calculations', () => {
    const made = addCalculation(budget())
    const other = addCalculation(made.def)
    const inputs = calculationInputs(other.def, other.id)
    expect(inputs.questions.map(x => x.id)).toEqual(['a', 'b', 'c'])
    expect(inputs.groups.map(g => [g.group.id, g.numbers.map(x => x.id)])).toEqual([['g', ['fee']]])
    expect(inputs.calculations.map(c => c.id)).toEqual([made.id])
  })

  it('names what reads a calculation before it goes', () => {
    const def: Definition = { ...budget(), calculations: [
      { id: 'x', key: 'x', type: 'number', expression: { answer: 'a' } },
      { id: 'y', key: 'y', type: 'number', expression: { fn: 'add', args: [{ calculation: 'x' }, { value: 1 }] } },
    ] }
    def.pages[1]!.items[0] = q('c', 'number', { visibleWhen: { left: { calculation: 'x' }, op: 'more-than', right: { value: 1 } } })
    expect(dependents(def, 'x').sort()).toEqual(['c', 'y'])
  })
})

describe('problems with a calculation', () => {
  const codes = (def: Definition) => checkDefinition(def).filter(p => p.at === 'x').map(p => `${p.level}:${p.code}`)
  const one = (more: Partial<NonNullable<Definition['calculations']>[number]>): Definition => ({ ...budget(), calculations: [{ id: 'x', key: 'x', type: 'number', expression: { answer: 'a' }, ...more }] })

  it('none for a working one, shown or not', () => {
    expect(codes(one({}))).toEqual([])
    expect(codes(one({ label: 'Sum', page: 'p1' }))).toEqual([])
  })
  it('needs words when it is shown, and a page that is there', () => {
    expect(codes(one({ page: 'p1' }))).toEqual(['error:no-label'])
    expect(codes(one({ label: 'Sum', page: 'gone' }))).toEqual(['error:unknown-page'])
  })
  it('refuses arithmetic on an answer that is not a number, or something no longer there', () => {
    expect(codes(one({ expression: { fn: 'add', args: [{ answer: 'words' }, { value: 1 }] } }))).toEqual(['error:not-a-number'])
    expect(codes(one({ expression: { fn: 'add', args: [{ answer: 'gone' }, { calculation: 'nothing' }] } }))).toEqual(['error:unknown-reference', 'error:unknown-reference'])
    expect(codes(one({ expression: { fn: 'sum', group: 'g', of: 'name' } }))).toEqual(['error:not-a-number'])
    expect(codes(one({ expression: { answer: 'fee' } }))).toEqual(['error:outside-group'])
  })
  it('warns when shown before an answer it reads is given', () => {
    expect(codes(one({ label: 'Sum', page: 'p1', expression: { fn: 'add', args: [{ answer: 'a' }, { answer: 'c' }] } }))).toEqual(['warning:shown-before-answered'])
    expect(codes(one({ label: 'Sum', page: 'p2', expression: { fn: 'add', args: [{ answer: 'a' }, { answer: 'c' }] } }))).toEqual([])
  })
  it('a percentage parses and works out as a share of one', () => {
    const def = one({ type: 'percent', expression: { fn: 'divide', args: [{ answer: 'a' }, { answer: 'c' }] } })
    expect(parseDefinition(def).ok).toBe(true)
    expect(evaluate(def, { a: 1, c: 4 }, { today }).calculated.x).toBe(0.25)
  })
  it('an old calculation with neither label nor page still parses and has no problems', () => {
    expect(parseDefinition(one({})).ok).toBe(true)
    expect(codes(one({ type: 'money' }))).toEqual([])
  })
})

describe('the Show proposal template', () => {
  const show = SHIPPED_TEMPLATES.find(x => x.key === 'forms.show-proposal')!.definition

  it('shows its total as money, with words, on the budget page, and has no problems', () => {
    expect(show.calculations).toEqual([expect.objectContaining({ key: 'total', type: 'money', label: 'Total budget', page: 'page-budget' })])
    expect(checkDefinition(show)).toEqual([])
    expect(formulaOf(show.calculations![0]!.expression)).toMatchObject({ blankAsNothing: true, rows: { length: 4 } })
  })
  it('adds up what is given, a blank counting as nothing', () => {
    expect(evaluate(show, { rights: 15000, set: 33000 }, { today }).calculated.total).toBe(48000)
  })
})
