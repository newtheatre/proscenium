// Words for the builder: a question type's icon, and a condition read back as a sentence (FB-204).
import type { Condition, Definition, Operand, Question, QuestionType } from '../../shared/engine'
import { questionsOf } from '../../shared/engine'
import type { Formula, Operation, Term } from '../../shared/builder/formula'
import { figureName } from '../../shared/figures'
import { FORMS_QUESTION_ICONS } from '../components/FormsQuestionIcon.vue'

export const formsQuestionIcon = (type: QuestionType): string => FORMS_QUESTION_ICONS[type]

/** The palette, in the groups it is offered in. */
export const FORMS_PALETTE: { group: string, types: QuestionType[] }[] = [
  { group: 'text', types: ['text.short', 'text.long', 'email', 'phone', 'url', 'address'] },
  { group: 'choice', types: ['choice.single', 'choice.multiple', 'choice.dropdown', 'choice.ranking', 'yesno', 'consent'] },
  { group: 'number', types: ['number', 'money', 'rating', 'scale'] },
  { group: 'date', types: ['date', 'time', 'datetime'] },
  { group: 'other', types: ['file', 'record'] },
]

export function formsQuestionName(q: Pick<Question, 'label'> | undefined): string {
  return q?.label.trim() || translate('forms.screens.builder.untitled')
}

/** A condition as a sentence: "Role is Cast and Age is at least 18". Matches the stored condition exactly. */
export function formsConditionSentence(condition: Condition, def: Definition): string {
  const questions = new Map(questionsOf(def).map(q => [q.question.id, q.question]))
  const calculations = new Map((def.calculations ?? []).map(c => [c.id, figureName(c)]))
  const operand = (o: Operand, about?: Question): string => {
    if ('answer' in o) return formsQuestionName(questions.get(o.answer))
    if ('calculation' in o) return calculations.get(o.calculation) ?? o.calculation
    if ('fact' in o) return o.fact
    if ('attribute' in o) return o.attribute
    if ('today' in o) return translate('forms.screens.logic.today')
    if ('option' in o) return o.option === 'other' ? translate('forms.screens.options.other') : about?.options?.find(x => x.id === o.option)?.label || o.option
    if (typeof o.value === 'boolean') return translate(o.value ? 'forms.screens.logic.yes' : 'forms.screens.logic.no')
    return String(o.value)
  }
  const say = (c: Condition, top: boolean): string => {
    for (const mode of ['all', 'any', 'none'] as const) {
      if (mode in c) {
        const parts = (c as Record<string, Condition[]>)[mode]!.map(x => say(x, false))
        if (!parts.length) return translate(`forms.screens.logic.empty-${mode}`)
        const joined = parts.join(` ${translate(`forms.screens.logic.join-${mode === 'any' ? 'any' : 'all'}`)} `)
        const text = mode === 'none' ? translate('forms.screens.logic.none-of', { what: joined }) : joined
        return top || parts.length < 2 ? text : `(${text})`
      }
    }
    const leaf = c as Exclude<Condition, { all: unknown } | { any: unknown } | { none: unknown }>
    const about = 'answer' in leaf.left ? questions.get(leaf.left.answer) : undefined
    const right = Array.isArray(leaf.right) ? leaf.right.map(o => operand(o, about)).join(leaf.op === 'between' ? ` ${translate('forms.screens.logic.and')} ` : ', ') : leaf.right ? operand(leaf.right, about) : ''
    const days = leaf.op === 'within-days' ? translate('forms.screens.logic.days-of', { days: leaf.days ?? 0 }) : ''
    return [operand(leaf.left), translate(`forms.operators.${leaf.op}`), days, right].filter(Boolean).join(' ')
  }
  return say(condition, true)
}

/** The colour a stage of each kind is shown in, wherever a stage is named. */
export function formsStageTone(kind: string | null | undefined): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  return kind === 'approved' ? 'success' : kind === 'declined' ? 'danger' : kind === 'returned' ? 'warning' : kind === 'in_review' || kind === 'pending' ? 'info' : 'neutral'
}

export const FORMS_OPERATION_SIGNS: Record<Operation, string> = { add: '+', subtract: '−', multiply: '×', divide: '÷' }

/** A formula as a line: "Performing rights + Set and props × 2". `number` words a number written into it. */
export function formsFormulaSentence(formula: Formula, def: Definition, number: (value: number, index: number) => string = v => String(v)): string {
  const questions = new Map(questionsOf(def).map(q => [q.question.id, q.question]))
  const groups = new Map(def.pages.flatMap(p => p.items).flatMap(i => i.kind === 'group' ? [[i.id, i] as const] : []))
  const groupName = (id: string) => groups.get(id)?.label.trim() || translate('forms.screens.builder.untitled-group')
  const term = (t: Term, i: number): string => {
    if ('answer' in t) return formsQuestionName(questions.get(t.answer))
    if ('calculation' in t) {
      const c = def.calculations?.find(x => x.id === t.calculation)
      return c ? figureName(c) : t.calculation
    }
    if ('value' in t) return number(t.value, i)
    if (t.fn === 'sum') return translate('forms.screens.calculations.sentence-sum', { question: formsQuestionName(questions.get(t.of)), group: groupName(t.group) })
    return translate('forms.screens.calculations.sentence-count', { group: groupName(t.group) })
  }
  return formula.rows.map((row, i) => (i ? `${FORMS_OPERATION_SIGNS[row.op ?? 'add']} ${term(row.term, i)}` : term(row.term, i))).join(' ')
}
