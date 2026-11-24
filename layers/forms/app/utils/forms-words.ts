// Words for the builder: a question type's icon, and a condition read back as a sentence (FB-204).
import type { Condition, Definition, Operand, Question, QuestionType } from '../../shared/engine'
import { questionsOf } from '../../shared/engine'
import type { Formula, Operation, Term } from '../../shared/builder/formula'
import { figureName } from '../../shared/figures'
import { find } from '../../shared/builder/edit'
import { FORMS_END } from './forms-canvas'
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
  // An option with no wording yet is named by its place, never by its id.
  const optionName = (about: Question | undefined, id: string): string => {
    const at = about?.options?.findIndex(x => x.id === id) ?? -1
    return about?.options?.[at]?.label.trim() || (at >= 0 ? translate('forms.screens.options.placeholder', { n: at + 1 }) : id)
  }
  const operand = (o: Operand, about?: Question): string => {
    if ('answer' in o) return formsQuestionName(questions.get(o.answer))
    if ('calculation' in o) return calculations.get(o.calculation) ?? o.calculation
    if ('fact' in o) return o.fact
    if ('attribute' in o) return o.attribute
    if ('today' in o) return translate('forms.screens.logic.today')
    if ('marking' in o) return translate(`forms.screens.logic.marking.${o.marking}`)
    if ('option' in o) return o.option === 'other' ? translate('forms.screens.options.other') : optionName(about, o.option)
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
  return kind === 'approved' ? 'success' : kind === 'declined' ? 'danger' : kind === 'returned' ? 'warning' : kind === 'in_review' ? 'info' : 'neutral'
}

/** What a problem is about, in the author's words: the question, page, stage or move it points at. */
export function formsProblemName(def: Definition, at: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (at.startsWith('stage:')) return def.workflow?.stages.find(s => s.key === at.slice(6))?.name.trim() || t('forms.screens.stages.a-stage') // not-policy: the length of "stage:"
  if (at === FORMS_END) return t('forms.screens.ends.end')
  if (at.startsWith('move:')) return def.workflow?.transitions.find(m => m.key === at.slice(5))?.label.trim() || t('forms.screens.stages.a-move') // not-policy: the length of "move:"
  const found = find(def, at)
  if (!found) {
    const calculation = def.calculations?.find(c => c.id === at)
    return calculation ? figureName(calculation) : at
  }
  if (found.kind === 'page') return found.page.title.trim() || t('forms.screens.builder.page-n', { n: found.pageIndex + 1 })
  const item = found.item
  return item.kind === 'question' ? formsQuestionName(item) : item.kind === 'group' ? item.label.trim() || t('forms.screens.builder.untitled-group') : t(`forms.screens.details.kind-${item.kind}`)
}

/** A problem in words. One about an option says which option. */
export function formsProblemWords(def: Definition, p: { code: string, at: string, params?: Record<string, string> }, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (p.code === 'no-label' && p.params?.option) {
    const found = find(def, p.at)
    const options = found && found.kind !== 'page' && found.item.kind === 'question' ? found.item.options ?? [] : []
    return t('forms.problems.option-no-label', { n: options.findIndex(o => o.id === p.params!.option) + 1 })
  }
  return t(`forms.problems.${p.code}`, p.params ?? {})
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

/** A file's size as people read it: "820 KB", "2.4 MB". */
export function formsFileSize(bytes: number): string {
  const KB = 1024 // not-policy: unit of size
  if (bytes < KB * KB) return translate('forms.screens.fill.file-kb', { n: Math.max(1, Math.round(bytes / KB)) })
  return translate('forms.screens.fill.file-mb', { n: (bytes / KB / KB).toFixed(1) })
}
