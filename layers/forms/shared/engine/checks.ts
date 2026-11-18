// The checks before publishing (part 3). The builder lists these as problems as the author works;
// an error blocks Publish and a warning does not. Each problem names the item it belongs to, so the
// list can link to it. Checks that need more than the definition (retention, who may answer, which
// modules are on) are added by the platform to the same list.
import { OTHER, PATTERNS } from './types'
import { unreached } from './reach'
import type { Comparison, Condition, Definition, Expression, Operand, Question, Rule, RuleName } from './types'
import { calculationsRead } from './calculations'
import { conditionsOf, questionsOf } from './definition'
import type { Index, ValueKind } from './values'
import { indexOf, kindOfQuestion, operatorsFor } from './values'

export type ProblemCode
  = | 'no-label' | 'no-options' | 'no-source' | 'unknown-source' | 'no-scale'
    | 'unknown-reference' | 'later-reference' | 'outside-group' | 'unknown-option' | 'unknown-fact'
    | 'wrong-comparison' | 'incomplete-comparison'
    | 'unknown-target' | 'route-back' | 'circular'
    | 'wrong-rule' | 'unsafe-pattern' | 'not-a-number'
    | 'never-reached' | 'never-shown' | 'required-never-shown'
    | 'empty-condition' | 'no-questions'
export interface Problem { level: 'error' | 'warning', code: ProblemCode, at: string, params?: Record<string, string> }

export interface CheckOptions {
  /** Sources that modules switched on now contribute. Left out, sources are not checked. */
  sources?: readonly string[]
  /** Facts declared now. Left out, facts are not checked. */
  facts?: readonly string[]
  attributes?: readonly string[]
  /** Whether a free regular expression may be used (a setting). */
  allowRegex?: boolean
}

const CHOICES = ['choice.single', 'choice.multiple', 'choice.dropdown', 'choice.ranking']
export const RULES_FOR: Record<RuleName, string[]> = {
  minLength: ['text.short', 'text.long'], maxLength: ['text.short', 'text.long'],
  min: ['number', 'money', 'rating', 'scale'], max: ['number', 'money', 'rating', 'scale'], whole: ['number'],
  minDate: ['date', 'datetime'], maxDate: ['date', 'datetime'],
  minChosen: ['choice.multiple', 'choice.dropdown', 'record'], maxChosen: ['choice.multiple', 'choice.dropdown', 'record'],
  pattern: ['text.short'], regex: ['text.short', 'text.long'],
  fileTypes: ['file'], maxFileSize: ['file'], maxFiles: ['file'],
}
/** A cheap guard against patterns that can take for ever: a repeat of a group that itself repeats. */
const runaway = (source: string): boolean => /\([^)]*[+*}][^)]*\)\s*[+*{]/.test(source) || source.length > 200

export function checkDefinition(def: Definition, options: CheckOptions = {}): Problem[] {
  const problems: Problem[] = []
  const index = indexOf(def)
  const error = (code: ProblemCode, at: string, params?: Record<string, string>) => problems.push({ level: 'error', code, at, ...(params ? { params } : {}) })

  // ---- wording, options, sources, rules ----
  def.pages.forEach((page) => {
    // A form of one page goes by the form's own title; pages need names once there are several.
    if (def.pages.length > 1 && !page.title.trim()) error('no-label', page.id)
    for (const it of page.items) {
      if (it.kind === 'group' && !it.label.trim()) error('no-label', it.id)
      if (it.kind === 'group' && !it.items.length) error('no-questions', it.id)
      if (it.kind === 'content' && !it.text.trim()) error('no-label', it.id)
    }
  })
  for (const { question: q } of questionsOf(def)) {
    if (!q.label.trim()) error('no-label', q.id)
    if (CHOICES.includes(q.type)) {
      if (!q.options?.length) error('no-options', q.id)
      for (const o of q.options ?? []) if (!o.label.trim()) error('no-label', q.id, { option: o.id })
    }
    if (q.type === 'record') {
      if (!q.source) error('no-source', q.id)
      else if (options.sources && !options.sources.includes(q.source)) error('unknown-source', q.id, { source: q.source })
    }
    if (q.type === 'scale' && (!q.scale || (q.scale.min ?? 0) >= q.scale.max)) error('no-scale', q.id)
    for (const rule of q.validation ?? []) checkRule(rule, q)
  }
  function checkRule(rule: Rule, q: Question) {
    if (!RULES_FOR[rule.rule].includes(q.type)) return error('wrong-rule', q.id, { rule: rule.rule })
    const v = rule.value
    const numeric = ['minLength', 'maxLength', 'min', 'max', 'minChosen', 'maxChosen', 'maxFileSize', 'maxFiles'].includes(rule.rule)
    if (numeric && typeof v !== 'number') error('wrong-rule', q.id, { rule: rule.rule })
    if (rule.rule === 'pattern' && !(typeof v === 'string' && v in PATTERNS)) error('wrong-rule', q.id, { rule: rule.rule })
    if (rule.rule === 'fileTypes' && !Array.isArray(v)) error('wrong-rule', q.id, { rule: rule.rule })
    if ((rule.rule === 'minDate' || rule.rule === 'maxDate') && !(typeof v === 'string' || (v && typeof v === 'object' && 'today' in v))) error('wrong-rule', q.id, { rule: rule.rule })
    if (rule.rule === 'regex') {
      if (!options.allowRegex || typeof v !== 'string') return error('wrong-rule', q.id, { rule: rule.rule })
      try { new RegExp(v, 'u') }
      catch { return error('unsafe-pattern', q.id) }
      if (runaway(v)) error('unsafe-pattern', q.id)
    }
  }

  // ---- conditions: what they refer to, and whether the comparison suits it ----
  const pageOfOwner = (owner: string): number | null => index.questions.get(owner)?.page ?? index.groups.get(owner)?.page ?? index.pageOf.get(owner) ?? null
  const contentPage = new Map<string, number>()
  def.pages.forEach((page, p) => page.items.forEach(it => it.kind === 'content' && contentPage.set(it.id, p)))

  for (const { condition, owner } of conditionsOf(def)) {
    const ownerPage = pageOfOwner(owner) ?? contentPage.get(owner) ?? null // null: a calculation, which may read any page
    const ownerGroup = index.questions.get(owner)?.group?.id
    walk(condition, c => checkComparison(c, owner, ownerPage, ownerGroup))
    if (hollow(condition)) error('empty-condition', owner)
  }
  /** Whether a condition has a group with nothing in it, which says nothing an author can have meant. */
  function hollow(c: Condition): boolean {
    const parts = 'all' in c ? c.all : 'any' in c ? c.any : 'none' in c ? c.none : null
    return parts !== null && (!parts.length || parts.some(hollow))
  }
  function walk(c: Condition, each: (c: Comparison) => void): void {
    if ('all' in c) return c.all.forEach(x => walk(x, each))
    if ('any' in c) return c.any.forEach(x => walk(x, each))
    if ('none' in c) return c.none.forEach(x => walk(x, each))
    each(c)
  }
  function kindOf(o: Operand, at: string, ownerPage: number | null, ownerGroup?: string): ValueKind | null {
    if ('answer' in o) {
      const q = index.questions.get(o.answer)
      const g = index.groups.get(o.answer)
      if (!q && !g) return error('unknown-reference', at, { reference: o.answer }), null
      if (ownerPage !== null && (q ?? g)!.page > ownerPage) return error('later-reference', at, { reference: o.answer }), null
      if (q?.group && q.group.id !== ownerGroup) return error('outside-group', at, { reference: o.answer }), null
      return q ? kindOfQuestion(q.question) : 'group'
    }
    if ('calculation' in o) {
      const c = index.calculations.get(o.calculation)
      if (!c) return error('unknown-reference', at, { reference: o.calculation }), null
      return c.type === 'date' ? 'date' : c.type === 'text' ? 'text' : 'number'
    }
    if ('fact' in o) {
      if (options.facts && !options.facts.includes(o.fact)) return error('unknown-fact', at, { reference: o.fact }), null
      return 'any'
    }
    if ('attribute' in o) {
      if (options.attributes && !options.attributes.includes(o.attribute)) return error('unknown-fact', at, { reference: o.attribute }), null
      return 'any'
    }
    if ('today' in o) return 'date'
    return 'any'
  }
  function checkComparison(c: Comparison, at: string, ownerPage: number | null, ownerGroup?: string) {
    const kind = kindOf(c.left, at, ownerPage, ownerGroup)
    const rights = c.right === undefined ? [] : Array.isArray(c.right) ? c.right : [c.right]
    for (const r of rights) kindOf(r, at, ownerPage, ownerGroup)
    if (kind === null) return
    if (kind !== 'any' && !operatorsFor(kind).includes(c.op)) return error('wrong-comparison', at, { comparison: c.op })
    const needs = c.op === 'answered' || c.op === 'empty' ? 0 : c.op === 'between' ? 2 : 1
    if (rights.length < needs || (c.op === 'within-days' && c.days === undefined)) return error('incomplete-comparison', at, { comparison: c.op })
    // An option named on the right must be one of the left question's own.
    if ('answer' in c.left) {
      const q = index.questions.get(c.left.answer)?.question
      const own = new Set([...(q?.options ?? []).map(o => o.id), ...(q?.allowOther ? [OTHER] : [])])
      for (const r of rights) if ('option' in r && !own.has(r.option)) error('unknown-option', at, { reference: c.left.answer, option: r.option })
    }
  }

  // ---- routes only go forward, to something that exists ----
  def.pages.forEach((page, p) => {
    for (const route of page.routes ?? []) {
      if ('ending' in route.to) {
        const id = route.to.ending
        if (!def.endings?.some(e => e.id === id)) error('unknown-target', page.id, { reference: id })
      }
      else {
        const target = index.pageOf.get(route.to.page)
        if (target === undefined) error('unknown-target', page.id, { reference: route.to.page })
        else if (target <= p) error('route-back', page.id, { reference: route.to.page })
      }
    }
  })

  // ---- calculations: what they read, and no circles ----
  for (const c of def.calculations ?? []) checkExpression(c.expression, c.id, index)
  function checkExpression(e: Expression, at: string, index: Index): void {
    if (!('fn' in e)) {
      if ('answer' in e) {
        const q = index.questions.get(e.answer)
        if (!q) error('unknown-reference', at, { reference: e.answer })
        else if (q.group) error('outside-group', at, { reference: e.answer })
      }
      else if ('calculation' in e && !index.calculations.has(e.calculation)) error('unknown-reference', at, { reference: e.calculation })
      return
    }
    if (e.fn === 'sum' || e.fn === 'count') {
      const g = index.groups.get(e.group)
      if (!g) return void error('unknown-reference', at, { reference: e.group })
      if (e.fn === 'sum') {
        const q = g.group.items.find(i => i.id === e.of)
        if (!q) error('unknown-reference', at, { reference: e.of })
        else if (kindOfQuestion(q) !== 'number') error('not-a-number', at, { reference: e.of })
      }
      return
    }
    if (e.fn === 'choose') {
      checkExpression(e.then, at, index)
      return checkExpression(e.else, at, index)
    }
    e.args.forEach(a => checkExpression(a, at, index))
  }
  const reads = new Map((def.calculations ?? []).map(c => [c.id, calculationsRead(c.expression)]))
  const state = new Map<string, 'open' | 'done'>()
  const circular = new Set<string>()
  const visit = (id: string, trail: string[]): void => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'open') return void trail.slice(trail.indexOf(id)).forEach(x => circular.add(x))
    state.set(id, 'open')
    for (const next of reads.get(id) ?? []) if (reads.has(next)) visit(next, [...trail, id])
    state.set(id, 'done')
  }
  for (const id of reads.keys()) visit(id, [])
  for (const id of circular) error('circular', id)

  // ---- what can never be reached or shown (warnings: they do not stop a publish) ----
  for (const u of unreached(def)) problems.push({ level: 'warning', code: u.why === 'route' ? 'never-reached' : u.required ? 'required-never-shown' : 'never-shown', at: u.at })

  return problems
}

/** Whether a definition may be published: it has no error. Warnings do not block. */
export const publishable = (problems: Problem[]): boolean => !problems.some(p => p.level === 'error')
