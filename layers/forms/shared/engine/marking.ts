// Marking a quiz (FB-513, rules MK1 to MK5). The server marks a response when it is sent, from the
// answers it stores and the key of the version they answered; nothing here reads a score from the
// browser. A definition leaves the server only through `publicDefinition`, which drops the key.
import { MARKABLE_TYPES, OTHER } from './types'
import type { AnswerKey, Definition, Evaluation, Item, Question, Value } from './types'
import { questionsOf } from './definition'
import { fold, isEmpty } from './values'

export const DEFAULT_POINTS = 1
export const isMarkable = (q: Pick<Question, 'type'>): boolean => (MARKABLE_TYPES as readonly string[]).includes(q.type)

/** How one question was marked. `fieldKey` is the question's key, as exports name it. */
export interface QuestionMark { questionId: string, fieldKey: string, correct: boolean, points: number, outOf: number, feedback?: string }
export interface Marked { score: number, outOf: number, passed: boolean | null, perQuestion: QuestionMark[] }

/** The questions that carry a correct answer, outside repeating groups (an answer in a group is refused at publish). */
export function keyedQuestions(def: Definition): Question[] {
  return questionsOf(def).filter(q => !q.group && q.question.answer && isMarkable(q.question)).map(q => q.question)
}
export const hasAnswerKey = (def: Definition): boolean => keyedQuestions(def).length > 0
export const pointsOf = (key: AnswerKey): number => key.points ?? DEFAULT_POINTS
/** The most a response can score when every keyed question is shown. */
export const totalPoints = (def: Definition): number => keyedQuestions(def).reduce((sum, q) => sum + pointsOf(q.answer!), 0)

/** MK2: exactly right or not at all. "Other" is never right, and a choice must hold every correct option and no other. */
export function isRight(q: Question, value: Value): boolean {
  const key = q.answer
  if (!key || isEmpty(value)) return false
  const { correct } = key
  if (q.type === 'yesno') return typeof correct === 'boolean' && value === correct
  if (q.type === 'number') {
    if (typeof value !== 'number' || typeof correct !== 'object' || Array.isArray(correct)) return false
    return (correct.min === undefined || value >= correct.min) && (correct.max === undefined || value <= correct.max)
  }
  if (!Array.isArray(correct)) return false
  if (q.type === 'text.short') return typeof value === 'string' && correct.some(t => fold(t) === fold(value))
  const chosen = Array.isArray(value) ? value : [value]
  if (chosen.some(v => typeof v !== 'string' || v === OTHER)) return false
  const want = new Set(correct)
  const got = new Set(chosen as string[])
  return got.size === want.size && [...got].every(id => want.has(id))
}

/**
 * Marks the answers a response keeps (MK1 to MK3). A question hidden by a condition is not marked
 * and its points leave the total. Null when the definition has no correct answers.
 */
export function mark(def: Definition, evaluation: Pick<Evaluation, 'visible' | 'answers'>): Marked | null {
  const keyed = keyedQuestions(def)
  if (!keyed.length) return null
  const perQuestion: QuestionMark[] = []
  for (const q of keyed) {
    if (!evaluation.visible[q.id]) continue
    const outOf = pointsOf(q.answer!)
    const correct = isRight(q, evaluation.answers[q.id] as Value)
    const feedback = correct ? q.answer!.feedback?.right : q.answer!.feedback?.wrong
    perQuestion.push({ questionId: q.id, fieldKey: q.key, correct, points: correct ? outOf : 0, outOf, ...(feedback ? { feedback } : {}) })
  }
  const score = perQuestion.reduce((sum, m) => sum + m.points, 0)
  const outOf = perQuestion.reduce((sum, m) => sum + m.outOf, 0)
  const passMark = def.marking?.passMark
  return { score, outOf, passed: passMark === undefined ? null : score >= passMark, perQuestion }
}

/** What the person who answered is told (MK4): the score always, feedback and the right answers as the form says. */
export interface ShownMarking {
  score: number
  outOf: number
  passed: boolean | null
  questions: { questionId: string, label: string, correct: boolean, feedback?: string, answer?: string }[]
}
export function shownMarking(def: Definition, marked: Marked): ShownMarking {
  const show = def.marking?.show ?? 'score'
  const out: ShownMarking = { score: marked.score, outOf: marked.outOf, passed: marked.passed, questions: [] }
  if (show === 'score') return out
  const byId = new Map(keyedQuestions(def).map(q => [q.id, q]))
  out.questions = marked.perQuestion.map((m) => {
    const q = byId.get(m.questionId)!
    return {
      questionId: m.questionId,
      label: q.label,
      correct: m.correct,
      ...(m.feedback ? { feedback: m.feedback } : {}),
      ...(show === 'score-feedback-and-answers' ? { answer: answerWords(q) } : {}),
    }
  })
  return out
}

/** The right answer in words, for a person shown the answers after sending. */
export function answerWords(q: Question): string {
  const correct = q.answer?.correct
  if (correct === undefined) return ''
  if (typeof correct === 'boolean') return correct ? 'Yes' : 'No'
  if (!Array.isArray(correct)) {
    if (correct.min !== undefined && correct.max !== undefined) return correct.min === correct.max ? String(correct.min) : `${correct.min} to ${correct.max}`
    return correct.min !== undefined ? `${correct.min} or more` : `${correct.max} or less`
  }
  if (q.type === 'text.short') return correct.join(' / ')
  return correct.map(id => q.options?.find(o => o.id === id)?.label ?? id).join(', ')
}

const withoutKey = (q: Question): Question => {
  const { answer: _answer, ...rest } = q
  return rest
}
const itemWithoutKey = (it: Item): Item => {
  if (it.kind === 'question') return withoutKey(it)
  if (it.kind === 'row') return { ...it, items: [withoutKey(it.items[0]), withoutKey(it.items[1])] }
  if (it.kind === 'group') return { ...it, items: it.items.map(withoutKey) }
  return it
}

/**
 * A definition as it may leave the server: without the correct answers and the pass mark. Every
 * route that sends a definition to a browser sends it through this (test "answer-key-never-sent").
 */
export function publicDefinition(def: Definition): Definition {
  const out: Definition = { ...def, pages: def.pages.map(p => ({ ...p, items: p.items.map(itemWithoutKey) })) }
  if (def.marking) out.marking = { show: def.marking.show }
  return out
}

/** A definition with no correct answers and no marking at all, for somebody who may not mark it. */
export const withoutAnswerKey = (def: Definition): Definition => keepAnswerKey(def, { format: def.format, pages: [] })

/**
 * Puts back the correct answers and the pass mark from `kept` onto `incoming`, for somebody who
 * may edit a form but not mark it: whatever they sent of either is ignored.
 */
export function keepAnswerKey(incoming: Definition, kept: Definition): Definition {
  const keys = new Map(questionsOf(kept).map(q => [q.question.id, q.question.answer]))
  const restore = (q: Question): Question => {
    const key = keys.get(q.id)
    return key ? { ...withoutKey(q), answer: key } : withoutKey(q)
  }
  const item = (it: Item): Item => {
    if (it.kind === 'question') return restore(it)
    if (it.kind === 'row') return { ...it, items: [restore(it.items[0]), restore(it.items[1])] }
    if (it.kind === 'group') return { ...it, items: it.items.map(restore) }
    return it
  }
  const { marking: _marking, ...rest } = incoming
  return { ...rest, pages: incoming.pages.map(p => ({ ...p, items: p.items.map(item) })), ...(kept.marking ? { marking: kept.marking } : {}) }
}
