// The engine's side of system moves (FB-514): the first that holds, in definition order (AT2); the
// marking operands; and the publish checks for a missing condition, a misplaced one and a loop (AT1, AT3).
import { describe, expect, it } from 'vitest'
import { checkDefinition, parseDefinition, systemMove } from '../../shared/engine'
import type { Condition, Definition, Question, Transition } from '../../shared/engine'

const today = '2026-11-24'
const q = (id: string, type: Question['type'], more: Partial<Question> = {}): Question => ({ kind: 'question', id, key: id, type, label: `Label ${id}`, dataClass: 'internal', ...more })
const move = (key: string, from: string, to: string, more: Partial<Transition> = {}): Transition => ({ key, from, to, label: key, who: 'system', ...more })
const over = (n: number): Condition => ({ left: { answer: 'age' }, op: 'more-than', right: { value: n } })
const flow = (transitions: Transition[], more: Partial<Definition> = {}): Definition => ({
  format: 1,
  pages: [{ id: 'p', title: 'Page', items: [q('age', 'number'), q('alone', 'yesno', { answer: { correct: false } })] }],
  workflow: { stages: ['a', 'b', 'c'].map(key => ({ key, name: key, kind: 'pending' as const })), transitions },
  ...more,
})
const errors = (def: Definition) => checkDefinition(def).filter(p => p.level === 'error').map(p => `${p.code}@${p.at}`)

describe('systemMove', () => {
  it('takes the first move from the stage whose condition holds, in definition order', () => {
    const def = flow([move('young', 'a', 'b', { when: over(5) }), move('old', 'a', 'c', { when: over(50) })])
    expect(systemMove(def, 'a', { age: 60 }, { today })?.key).toBe('young')
    expect(systemMove(def, 'a', { age: 3 }, { today })).toBeUndefined()
    expect(systemMove(def, 'b', { age: 60 }, { today })).toBeUndefined()
  })

  it('reads the score, the percentage and whether it passed, and nothing for a response not marked', () => {
    const passed = flow([move('pass', 'a', 'b', { when: { left: { marking: 'passed' }, op: 'is', right: { value: true } } }), move('half', 'a', 'c', { when: { left: { marking: 'percent' }, op: 'at-least', right: { value: 50 } } })])
    expect(systemMove(passed, 'a', {}, { today, marking: { score: 1, outOf: 2, passed: true } })?.key).toBe('pass')
    expect(systemMove(passed, 'a', {}, { today, marking: { score: 1, outOf: 2, passed: false } })?.key).toBe('half')
    expect(systemMove(passed, 'a', {}, { today, marking: null })).toBeUndefined()
  })
})

describe('publish checks', () => {
  it('reads a system move with its condition from a definition', () => {
    expect(parseDefinition(flow([move('m', 'a', 'b', { when: over(5) })])).ok).toBe(true)
  })

  it('wants a condition on a system move and refuses one on a staff move', () => {
    expect(errors(flow([move('m', 'a', 'b'), move('s', 'b', 'c', { who: 'staff', when: over(5) })]))).toEqual(['system-no-condition@move:m', 'condition-not-system@move:s'])
  })

  it('refuses system moves that can lead back to where they started, and not a chain that ends', () => {
    expect(errors(flow([move('ab', 'a', 'b', { when: over(1) }), move('bc', 'b', 'c', { when: over(1) }), move('ca', 'c', 'a', { when: over(1) })]))).toEqual(['system-loop@move:ab', 'system-loop@move:bc', 'system-loop@move:ca'])
    expect(errors(flow([move('ab', 'a', 'b', { when: over(1) }), move('bc', 'b', 'c', { when: over(1) })]))).toEqual([])
  })

  it('refuses a marking operand on a form with no correct answers', () => {
    const plain = flow([move('m', 'a', 'b', { when: { left: { marking: 'score' }, op: 'at-least', right: { value: 1 } } })])
    plain.pages[0]!.items = [q('age', 'number')]
    expect(errors(plain)).toEqual(['marking-unmarked@move:m'])
  })
})
