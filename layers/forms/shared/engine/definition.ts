// Reading a definition (FB-101): it matches the format or it is refused with the path to the fault.
// Whether it makes sense to publish (a condition that points nowhere, a circle of calculations) is
// `checkDefinition`'s job, so a draft may be saved while it still has problems.
import { z } from 'zod'
import { CALCULATION_TYPES, DATA_CLASSES, DEFAULT_LIMITS, FORMAT, FUNCTIONS, MOVERS, OPERATORS, OTHER, PASS_MARKS, QUESTION_TYPES, REVIEW_MODES, RULES, STAGE_KINDS } from './types'
import type { Condition, Definition, Expression, Group, Limits, Question } from './types'

const id = z.string().regex(/^[\w-]{1,64}$/)
const key = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)
const text = z.string().max(4000)
const literal = z.union([z.string().max(1000), z.number(), z.boolean()])

const review = z.strictObject({
  mode: z.enum(REVIEW_MODES),
  reviewers: z.strictObject({ role: z.string().min(1).max(100).optional(), people: z.array(z.string().min(1).max(100)).max(40).optional() }),
  criteria: z.array(z.strictObject({ id, label: z.string().max(200), max: z.number().int().min(1).max(100), weight: z.number().min(0).max(100).optional() })).max(20).optional(),
  pass: z.enum(PASS_MARKS).optional(),
  quorum: z.number().int().min(1).max(40).optional(),
  open: z.boolean().optional(),
  secret: z.boolean().optional(),
})

const operand = z.union([
  z.strictObject({ answer: id }),
  z.strictObject({ calculation: id }),
  z.strictObject({ fact: z.string().min(1).max(100) }),
  z.strictObject({ attribute: z.string().min(1).max(100) }),
  z.strictObject({ today: z.literal(true) }),
  z.strictObject({ option: id }),
  z.strictObject({ value: literal }),
])

const comparison = z.strictObject({
  left: operand,
  op: z.enum(OPERATORS),
  right: z.union([operand, z.array(operand).max(50)]).optional(),
  days: z.number().int().min(0).max(3660).optional(),
})
// A draft may hold a condition group, a list of options to compare with, or a repeating group that is
// still empty; the problems list stops one being published (checks.ts).
const condition: z.ZodType<Condition> = z.lazy(() => z.union([
  z.strictObject({ all: z.array(condition).max(20) }),
  z.strictObject({ any: z.array(condition).max(20) }),
  z.strictObject({ none: z.array(condition).max(20) }),
  comparison,
]))

const rule = z.strictObject({
  rule: z.enum(RULES),
  value: z.union([z.string().max(500), z.number(), z.array(z.string().max(100)).max(30), z.strictObject({ today: z.number().int() })]).optional(),
  message: z.string().max(300).optional(),
})

const question = z.strictObject({
  kind: z.literal('question'),
  id,
  key,
  type: z.enum(QUESTION_TYPES),
  label: text,
  help: text.optional(),
  options: z.array(z.strictObject({ id: id.refine(v => v !== OTHER, 'is kept for the "Other" answer'), label: z.string().max(300) })).max(200).optional(),
  allowOther: z.boolean().optional(),
  source: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/).optional(),
  multiple: z.boolean().optional(),
  scale: z.strictObject({ min: z.number().int().optional(), max: z.number().int(), minLabel: z.string().max(60).optional(), maxLabel: z.string().max(60).optional() }).optional(),
  required: z.union([z.boolean(), condition]).optional(),
  visibleWhen: condition.optional(),
  validation: z.array(rule).max(10).optional(),
  dataClass: z.enum(DATA_CLASSES),
  peopleInvolved: z.boolean().optional(),
  openSearch: z.boolean().optional(),
}) satisfies z.ZodType<Question>

const group = z.strictObject({
  kind: z.literal('group'),
  id,
  key,
  label: text,
  help: text.optional(),
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(1).optional(),
  visibleWhen: condition.optional(),
  items: z.array(question).max(30),
}) satisfies z.ZodType<Group>

const item = z.discriminatedUnion('kind', [
  question,
  group,
  z.strictObject({ kind: z.literal('row'), id, items: z.tuple([question, question]) }),
  z.strictObject({ kind: z.literal('content'), id, text: z.string().max(10000), visibleWhen: condition.optional() }),
])

const expression: z.ZodType<Expression> = z.lazy(() => z.union([
  operand,
  z.strictObject({ fn: z.enum(FUNCTIONS), args: z.array(expression).min(1).max(20), places: z.number().int().min(0).max(6).optional() }),
  z.strictObject({ fn: z.literal('sum'), group: id, of: id }),
  z.strictObject({ fn: z.literal('count'), group: id }),
  z.strictObject({ fn: z.literal('choose'), when: condition, then: expression, else: expression }),
]))

const definition = z.strictObject({
  format: z.literal(FORMAT),
  pages: z.array(z.strictObject({
    id,
    title: z.string().max(300),
    help: text.optional(),
    visibleWhen: condition.optional(),
    items: z.array(item).max(500),
    routes: z.array(z.strictObject({ when: condition, to: z.union([z.strictObject({ page: id }), z.strictObject({ ending: id })]) })).max(20).optional(),
  })).min(1),
  calculations: z.array(z.strictObject({ id, key, type: z.enum(CALCULATION_TYPES), expression, label: z.string().max(300).optional(), page: id.optional() })).max(100).optional(),
  endings: z.array(z.strictObject({ id, title: z.string().max(300), message: text.optional(), submits: z.boolean() })).max(30).optional(),
  presentation: z.strictObject({ introduction: text.optional(), submitLabel: z.string().max(60).optional(), confirmation: text.optional(), progress: z.boolean().optional() }).optional(),
  workflow: z.strictObject({
    stages: z.array(z.strictObject({ key, name: z.string().max(100), kind: z.enum(STAGE_KINDS), status: z.string().max(100).optional(), review: review.optional() })).min(1).max(20),
    transitions: z.array(z.strictObject({ key, from: key, to: key, label: z.string().max(100), who: z.enum(MOVERS), needsReason: z.boolean().optional(), actions: z.array(z.strictObject({ id: key, action: z.string().min(1).max(100), map: z.record(z.string().max(100), z.string().max(100)) })).max(10).optional() })).max(60),
  }).optional(),
}) satisfies z.ZodType<Definition>

/** A fault in a definition: where it is, as a path of keys and indexes, and what is wrong. */
export interface Fault { path: (string | number)[], code: 'format' | 'duplicate-id' | 'duplicate-key' | 'limit', message: string, limit?: keyof Limits }
export type Parsed = { ok: true, definition: Definition } | { ok: false, faults: Fault[] }

/** Every question in a definition, wherever it sits, with the group it repeats in. */
export function questionsOf(def: Definition): { question: Question, page: number, group?: Group }[] {
  const out: { question: Question, page: number, group?: Group }[] = []
  def.pages.forEach((page, p) => {
    for (const it of page.items) {
      if (it.kind === 'question') out.push({ question: it, page: p })
      else if (it.kind === 'row') for (const q of it.items) out.push({ question: q, page: p })
      else if (it.kind === 'group') for (const q of it.items) out.push({ question: q, page: p, group: it })
    }
  })
  return out
}

export function conditionDepth(c: Condition): number {
  const inner = 'all' in c ? c.all : 'any' in c ? c.any : 'none' in c ? c.none : null
  return inner ? 1 + Math.max(0, ...inner.map(conditionDepth)) : 0
}

/** Every condition in a definition with the path to it. */
export function conditionsOf(def: Definition): { condition: Condition, path: (string | number)[], owner: string }[] {
  const out: { condition: Condition, path: (string | number)[], owner: string }[] = []
  const inExpression = (e: Expression, path: (string | number)[], owner: string) => {
    if ('fn' in e) {
      if (e.fn === 'choose') {
        out.push({ condition: e.when, path: [...path, 'when'], owner })
        inExpression(e.then, [...path, 'then'], owner)
        inExpression(e.else, [...path, 'else'], owner)
      }
      else if ('args' in e) e.args.forEach((a, i) => inExpression(a, [...path, 'args', i], owner))
    }
  }
  const ofQuestion = (q: Question, path: (string | number)[]) => {
    if (q.visibleWhen) out.push({ condition: q.visibleWhen, path: [...path, 'visibleWhen'], owner: q.id })
    if (typeof q.required === 'object') out.push({ condition: q.required, path: [...path, 'required'], owner: q.id })
  }
  def.pages.forEach((page, p) => {
    if (page.visibleWhen) out.push({ condition: page.visibleWhen, path: ['pages', p, 'visibleWhen'], owner: page.id })
    page.routes?.forEach((r, i) => out.push({ condition: r.when, path: ['pages', p, 'routes', i, 'when'], owner: page.id }))
    page.items.forEach((it, i) => {
      const path = ['pages', p, 'items', i]
      if (it.kind === 'question') ofQuestion(it, path)
      else if (it.kind === 'row' || it.kind === 'group') {
        if (it.kind === 'group' && it.visibleWhen) out.push({ condition: it.visibleWhen, path: [...path, 'visibleWhen'], owner: it.id })
        it.items.forEach((q, j) => ofQuestion(q, [...path, 'items', j]))
      }
      else if (it.visibleWhen) out.push({ condition: it.visibleWhen, path: [...path, 'visibleWhen'], owner: it.id })
    })
  })
  def.calculations?.forEach((c, i) => inExpression(c.expression, ['calculations', i, 'expression'], c.id))
  return out
}

/** Reads an unknown value as a definition, or says where it departs from the format. */
export function parseDefinition(input: unknown, limits: Limits = DEFAULT_LIMITS): Parsed {
  const read = definition.safeParse(input)
  if (!read.success) {
    return { ok: false, faults: read.error.issues.map(i => ({ path: i.path.filter((p): p is string | number => typeof p !== 'symbol'), code: 'format' as const, message: i.message })) }
  }
  const def = read.data as Definition
  const faults: Fault[] = []
  const limit = (name: keyof Limits, over: boolean, path: (string | number)[]) => {
    if (over) faults.push({ path, code: 'limit', limit: name, message: `is over the limit "${name}" (${limits[name]})` })
  }

  // Ids are unique across the whole definition; keys across questions, groups and calculations.
  const ids = new Map<string, true>()
  const keys = new Map<string, true>()
  const seeId = (v: string, path: (string | number)[]) => {
    if (ids.has(v)) faults.push({ path: [...path, 'id'], code: 'duplicate-id', message: `the id "${v}" is used twice` })
    ids.set(v, true)
  }
  const seeKey = (v: string, path: (string | number)[]) => {
    if (keys.has(v)) faults.push({ path: [...path, 'key'], code: 'duplicate-key', message: `the key "${v}" is used twice` })
    keys.set(v, true)
  }
  const seeQuestion = (q: Question, path: (string | number)[]) => {
    seeId(q.id, path)
    seeKey(q.key, path)
    const options = new Set<string>()
    q.options?.forEach((o, i) => {
      if (options.has(o.id)) faults.push({ path: [...path, 'options', i, 'id'], code: 'duplicate-id', message: `the option id "${o.id}" is used twice` })
      options.add(o.id)
    })
  }
  def.pages.forEach((page, p) => {
    seeId(page.id, ['pages', p])
    page.items.forEach((it, i) => {
      const path = ['pages', p, 'items', i]
      if (it.kind === 'question') return seeQuestion(it, path)
      seeId(it.id, path)
      if (it.kind === 'group') {
        seeKey(it.key, path)
        limit('repeatEntries', (it.max ?? 0) > limits.repeatEntries, [...path, 'max'])
      }
      if (it.kind !== 'content') it.items.forEach((q, j) => seeQuestion(q, [...path, 'items', j]))
    })
  })
  def.calculations?.forEach((c, i) => {
    seeId(c.id, ['calculations', i])
    seeKey(c.key, ['calculations', i])
  })
  def.endings?.forEach((e, i) => seeId(e.id, ['endings', i]))

  limit('pages', def.pages.length > limits.pages, ['pages'])
  limit('questions', questionsOf(def).length > limits.questions, ['pages'])
  limit('definitionBytes', new TextEncoder().encode(JSON.stringify(def)).length > limits.definitionBytes, [])
  for (const c of conditionsOf(def)) limit('conditionDepth', conditionDepth(c.condition) > limits.conditionDepth, c.path)

  return faults.length ? { ok: false, faults } : { ok: true, definition: def }
}
