// The condition editor chooses among questions, so a system move's condition (FB-514) offers what a
// quiz scored as three stand-in questions, and these turn them into marking operands and back.
import { MARKING_OPERANDS, type Condition, type MarkingOperand, type Operand, type Question } from '../../shared/engine'

const PREFIX = 'marking:'

/** Score, percentage and whether it passed, as questions the condition editor can offer. */
export function formsMarkingQuestions(): Question[] {
  return MARKING_OPERANDS.map(m => ({ kind: 'question', id: `${PREFIX}${m}`, key: m, type: m === 'passed' ? 'yesno' : 'number', label: translate(`forms.screens.logic.marking.${m}`), dataClass: 'internal' }))
}

function mapCondition(c: Condition, each: (o: Operand) => Operand): Condition {
  if ('all' in c) return { all: c.all.map(x => mapCondition(x, each)) }
  if ('any' in c) return { any: c.any.map(x => mapCondition(x, each)) }
  if ('none' in c) return { none: c.none.map(x => mapCondition(x, each)) }
  return { ...c, left: each(c.left) }
}

/** A stored condition as the editor reads it. */
export const formsMarkingToEditor = (c: Condition | undefined): Condition | undefined =>
  c && mapCondition(c, o => ('marking' in o ? { answer: `${PREFIX}${o.marking}` } : o))

/** What the editor wrote, as it is stored. */
export const formsMarkingFromEditor = (c: Condition | undefined): Condition | undefined =>
  c && mapCondition(c, o => ('answer' in o && o.answer.startsWith(PREFIX) ? { marking: o.answer.slice(PREFIX.length) as MarkingOperand } : o))
