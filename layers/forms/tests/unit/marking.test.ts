// Marking a quiz (FB-513): exact matches only (MK2), a hidden question leaves the total (MK3), the
// publish checks on correct answers, and the answer key never leaving the server.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkDefinition, evaluate, keepAnswerKey, mark, parseDefinition, publicDefinition, shownMarking, withoutAnswerKey } from '../../shared/engine'
import type { AnswerKey, Answers, Definition, Item, Question } from '../../shared/engine'

const today = '2026-11-24'
const q = (id: string, type: Question['type'], more: Partial<Question> = {}): Question => ({ kind: 'question', id, key: id, type, label: `Label ${id}`, dataClass: 'internal', ...more })
const form = (items: Item[], more: Partial<Definition> = {}): Definition => ({ format: 1, pages: [{ id: 'p', title: 'Page', items }], ...more })
const colours = [{ id: 'r', label: 'Red' }, { id: 'g', label: 'Green' }, { id: 'b', label: 'Blue' }]
const keyed = (id: string, type: Question['type'], answer: AnswerKey, more: Partial<Question> = {}) => q(id, type, { answer, ...more })
const marked = (def: Definition, answers: Answers) => mark(def, evaluate(def, answers, { today }))
const right = (question: Question, value: unknown) => marked(form([question]), { [question.id]: value } as Answers)!.perQuestion[0]!.correct

describe('marking-exact-match', () => {
  it('marks a single choice right only for the correct option, and "Other" never', () => {
    const single = keyed('c', 'choice.single', { correct: ['g'] }, { options: colours, allowOther: true })
    expect(right(single, 'g')).toBe(true)
    expect(right(single, 'r')).toBe(false)
    expect(right(single, 'other')).toBe(false)
    expect(right(single, undefined)).toBe(false)
  })
  it('marks a multiple choice right only with every correct option and no other', () => {
    const many = keyed('m', 'choice.multiple', { correct: ['r', 'b'] }, { options: colours })
    expect(right(many, ['b', 'r'])).toBe(true)
    expect(right(many, ['r'])).toBe(false)
    expect(right(many, ['r', 'b', 'g'])).toBe(false)
    const dropdown = keyed('d', 'choice.dropdown', { correct: ['r', 'g'] }, { options: colours, multiple: true })
    expect(right(dropdown, ['g', 'r'])).toBe(true)
    expect(right(dropdown, ['g'])).toBe(false)
  })
  it('marks yes or no, a number within its range inclusive, and short text ignoring case and the spaces round it', () => {
    expect(right(keyed('y', 'yesno', { correct: false }), false)).toBe(true)
    expect(right(keyed('y', 'yesno', { correct: false }), true)).toBe(false)
    const number = keyed('n', 'number', { correct: { min: 10, max: 12 } })
    expect([right(number, 10), right(number, 12), right(number, 12.5), right(number, 9)]).toEqual([true, true, false, false])
    expect(right(keyed('n', 'number', { correct: { min: 18 } }), 99)).toBe(true)
    const text = keyed('t', 'text.short', { correct: ['Fire exit', 'exit'] })
    expect([right(text, '  FIRE EXIT '), right(text, 'Exit'), right(text, 'fire exits')]).toEqual([true, true, false])
  })
  it('adds points, gives the feedback for right or wrong, and passes at the pass mark', () => {
    const def = form([
      keyed('a', 'yesno', { correct: true, points: 3, feedback: { right: 'Well done', wrong: 'Read the guide again' } }),
      keyed('b', 'text.short', { correct: ['stage left'] }),
    ], { marking: { passMark: 3, show: 'score-and-feedback' } })
    expect(marked(def, { a: true, b: 'stage right' })).toEqual({
      score: 3, outOf: 4, passed: true,
      perQuestion: [
        { questionId: 'a', fieldKey: 'a', correct: true, points: 3, outOf: 3, feedback: 'Well done' },
        { questionId: 'b', fieldKey: 'b', correct: false, points: 0, outOf: 1 },
      ],
    })
    expect(marked(def, { a: false, b: 'Stage Left' })).toMatchObject({ score: 1, outOf: 4, passed: false })
    expect(marked({ ...def, marking: { show: 'score' } }, { a: true })!.passed).toBeNull()
  })
  it('marks nothing on a form with no correct answers', () => {
    expect(marked(form([q('a', 'yesno')]), { a: true })).toBeNull()
  })
})

describe('marking-hidden-question', () => {
  it('leaves a question hidden by a condition out of the score and the total', () => {
    const def = form([
      keyed('crew', 'yesno', { correct: true }),
      keyed('ladder', 'yesno', { correct: true, points: 5 }, { visibleWhen: { left: { answer: 'crew' }, op: 'is', right: { value: true } } }),
    ])
    expect(marked(def, { crew: false, ladder: true })).toMatchObject({ score: 0, outOf: 1, perQuestion: [{ questionId: 'crew' }] })
    expect(marked(def, { crew: true, ladder: true })).toMatchObject({ score: 6, outOf: 6 })
  })
})

describe('what the person is shown (MK4)', () => {
  const def = form([keyed('c', 'choice.single', { correct: ['g'], feedback: { wrong: 'Green means go' } }, { options: colours })])
  const result = marked(def, { c: 'r' })!
  it('shows the score only, then feedback, then the correct answers, as the form says', () => {
    expect(shownMarking({ ...def, marking: { show: 'score' } }, result)).toEqual({ score: 0, outOf: 1, passed: null, questions: [] })
    expect(shownMarking({ ...def, marking: { show: 'score-and-feedback' } }, result).questions).toEqual([{ questionId: 'c', label: 'Label c', correct: false, feedback: 'Green means go' }])
    expect(shownMarking({ ...def, marking: { show: 'score-feedback-and-answers' } }, result).questions[0]).toMatchObject({ answer: 'Green' })
  })
})

describe('the answer key in a definition', () => {
  const quiz = form([
    keyed('a', 'yesno', { correct: true }),
    { kind: 'row', id: 'row', items: [keyed('b', 'number', { correct: { min: 1, max: 2 } }), q('c', 'text.short')] },
  ], { marking: { passMark: 1, show: 'score-and-feedback' } })

  it('is read as part of the format, and refused out of bounds', () => {
    expect(parseDefinition(quiz).ok).toBe(true)
    expect(parseDefinition(form([keyed('a', 'yesno', { correct: true, points: 101 })])).ok).toBe(false)
    expect(parseDefinition(form([keyed('a', 'yesno', { correct: true, feedback: { right: 'x'.repeat(501) } })])).ok).toBe(false)
    expect(parseDefinition(form([q('a', 'yesno')], { marking: { show: 'everything' as never } })).ok).toBe(false)
  })
  it('leaves the server without the correct answers and the pass mark, keeping what to show', () => {
    const shown = publicDefinition(quiz)
    expect(JSON.stringify(shown)).not.toMatch(/"answer"|passMark/)
    expect(shown.marking).toEqual({ show: 'score-and-feedback' })
    expect(JSON.stringify(withoutAnswerKey(quiz))).not.toMatch(/"answer"|"marking"/)
  })
  it('keeps the draft\'s key when somebody who may not mark saves the form', () => {
    const edited = form([q('a', 'yesno', { label: 'New words', answer: { correct: false } }), { kind: 'row', id: 'row', items: [q('b', 'number'), q('c', 'text.short')] }], { marking: { show: 'score' } })
    const kept = keepAnswerKey(edited, quiz)
    expect(kept.pages[0]!.items[0]).toMatchObject({ label: 'New words', answer: { correct: true } })
    expect(kept.marking).toEqual(quiz.marking)
    expect((kept.pages[0]!.items[1] as { items: Question[] }).items[0]!.answer).toEqual({ correct: { min: 1, max: 2 } })
  })
})

describe('the checks before publishing', () => {
  const codes = (def: Definition) => checkDefinition(def).filter(p => p.code.startsWith('answer') || p.code.includes('mark')).map(p => `${p.level}:${p.code}@${p.at}`)
  it('refuses a correct answer that cannot be right or does not suit its question', () => {
    expect(codes(form([
      keyed('a', 'text.long', { correct: ['x'] }),
      keyed('b', 'choice.single', { correct: ['r', 'g'] }, { options: colours }),
      keyed('c', 'choice.multiple', { correct: ['gone'] }, { options: colours }),
      keyed('d', 'number', { correct: { min: 5, max: 1 } }),
      keyed('e', 'number', { correct: {} }),
      keyed('f', 'yesno', { correct: ['yes'] }),
      keyed('g', 'text.short', { correct: ['  '] }),
      keyed('h', 'yesno', { correct: true }, { dataClass: 'special' }),
    ]))).toEqual([
      'error:answer-wrong-type@a', 'error:answer-never-right@b', 'error:answer-unknown-option@c', 'error:answer-range@d',
      'error:answer-empty@e', 'error:answer-wrong-type@f', 'error:answer-empty@g', 'error:answer-special@h',
    ])
  })
  it('refuses a correct answer in a repeating group, and a pass mark above the total', () => {
    expect(codes(form([{ kind: 'group', id: 'g', key: 'g', label: 'Each', items: [keyed('a', 'yesno', { correct: true })] }]))).toEqual(['error:answer-in-group@a'])
    expect(codes(form([keyed('a', 'yesno', { correct: true, points: 2 })], { marking: { passMark: 3, show: 'score' } }))).toEqual(['error:pass-mark-over@form:end'])
    expect(codes(form([q('a', 'yesno')], { marking: { show: 'score' } }))).toEqual(['warning:marking-no-answers@form:end'])
    expect(codes(form([keyed('a', 'yesno', { correct: true, points: 2 })], { marking: { passMark: 2, show: 'score' } }))).toEqual([])
  })
})

// Every route that puts a definition in its reply sends it through publicDefinition, or, to an
// author, authorDefinition, which keeps the key only for somebody who may mark the form.
describe('answer-key-never-sent', () => {
  const root = join(__dirname, '../../../..')
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const path = join(dir, f)
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : []
  })
  const routes = readdirSync(join(root, 'layers')).flatMap((layer) => {
    try {
      return files(join(root, 'layers', layer, 'server/api'))
    }
    catch {
      return []
    }
  })
  const SAFE = /^(?:(?:await )?(?:publicDefinition|authorDefinition)\(|null\b|z\.|string\b|Definition\b|unknown\b|forTemplate\()/
  it('finds the routes', () => expect(routes.length).toBeGreaterThan(50))
  it('sends no definition any other way', () => {
    const unsafe: string[] = []
    for (const path of routes) {
      const source = readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/'[^'\n]*'/g, '\'\'')
      // A property with a value, and a property given by name alone on a line of its own.
      for (const match of source.matchAll(/\bdefinition\??:\s*([^\n,})]+)|^\s+definition,\s*$/gm)) {
        if (match[1] !== undefined && SAFE.test(match[1].trim())) continue
        unsafe.push(`${relative(root, path)}: ${match[0].trim()}`)
      }
    }
    expect(unsafe).toEqual([])
  })
})
