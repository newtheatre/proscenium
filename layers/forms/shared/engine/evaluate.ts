// The engine's one entry point (part 3, "Order of evaluation"). Given a definition, the answers so
// far and the server's facts, it says what is visible, what is required, what is wrong, the
// calculated values and the route through the pages. The server runs it again on submission and
// stores `answers` from its own result, never anything the browser worked out.
import { otherKey } from './types'
import type { Answers, Context, Definition, Ending, Entry, Evaluation, Issue, Question, Value } from './types'
import { calculate } from './calculations'
import type { Scope } from './conditions'
import { holds } from './conditions'
import { check } from './validation'
import { indexOf } from './values'
import type { Index } from './values'

interface Shown { visible: Record<string, boolean>, route: string[], ending: Ending | null }

function scopeFor(index: Index, answers: Answers, context: Context): Scope {
  const done = new Map<string, string | number | null>()
  const working = new Set<string>()
  const scope: Scope = {
    index,
    answers,
    context,
    calculated(id) {
      if (done.has(id)) return done.get(id)!
      const calculation = index.calculations.get(id)
      // A circle is refused at publish; here it is simply empty, so a draft cannot hang the page.
      if (!calculation || working.has(id)) return null
      working.add(id)
      const value = calculate(calculation, scope)
      working.delete(id)
      done.set(id, value)
      return value
    },
  }
  return scope
}

const entriesOf = (answers: Answers, group: string): Entry[] => {
  const v = answers[group]
  return Array.isArray(v) ? (v as unknown[]).filter((e): e is Entry => !!e && typeof e === 'object' && !Array.isArray(e)) : []
}

/** Steps 4 and 8: page by page in order, following the routes forward. */
function show(def: Definition, scope: Scope): Shown {
  const visible: Record<string, boolean> = {}
  const route: string[] = []
  let ending: Ending | null = null
  const question = (q: Question, path: string, parent: boolean, inner: Scope) => {
    visible[path] = parent && (!q.visibleWhen || holds(q.visibleWhen, inner))
  }
  const page = (p: number, on: boolean) => {
    const pg = def.pages[p]!
    visible[pg.id] = on
    for (const it of pg.items) {
      if (it.kind === 'question') question(it, it.id, on, scope)
      else if (it.kind === 'content') visible[it.id] = on && (!it.visibleWhen || holds(it.visibleWhen, scope))
      else if (it.kind === 'row') {
        for (const q of it.items) question(q, q.id, on, scope)
        visible[it.id] = it.items.some(q => visible[q.id])
      }
      else {
        const shown = on && (!it.visibleWhen || holds(it.visibleWhen, scope))
        visible[it.id] = shown
        entriesOf(scope.answers, it.id).forEach((values, i) => {
          const inner = { ...scope, entry: { group: it.id, values } }
          for (const q of it.items) question(q, `${it.id}.${i}.${q.id}`, shown, inner)
        })
      }
    }
  }

  let p = 0
  let stopped = false
  while (p < def.pages.length) {
    const pg = def.pages[p]!
    const on = !stopped && (!pg.visibleWhen || holds(pg.visibleWhen, scope))
    page(p, on)
    let next = p + 1
    if (on) {
      route.push(pg.id)
      const taken = pg.routes?.find(r => holds(r.when, scope))
      if (taken && 'ending' in taken.to) {
        const id = taken.to.ending
        ending = def.endings?.find(e => e.id === id) ?? null
        stopped = ending !== null
      }
      else if (taken && 'page' in taken.to) {
        // Only forward: a route back is refused at publish and ignored here.
        const target = scope.index.pageOf.get(taken.to.page)
        if (target !== undefined && target > p) next = target
      }
    }
    for (let skipped = p + 1; skipped < next; skipped++) page(skipped, false)
    p = next
  }
  return { visible, route, ending }
}

/** Step 5: the answer to every hidden question is treated as empty, and unknown keys are dropped. */
function clean(def: Definition, index: Index, input: Answers, visible: Record<string, boolean>): Answers {
  const out: Answers = {}
  const keep = (q: Question, from: Record<string, unknown>, to: Record<string, unknown>, path: string) => {
    if (!visible[path] || from[q.id] === undefined) return
    to[q.id] = from[q.id]
    const other = from[otherKey(q.id)]
    if (q.allowOther && other !== undefined) to[otherKey(q.id)] = other
  }
  for (const { question, group } of index.questions.values()) if (!group) keep(question, input, out, question.id)
  for (const { group } of index.groups.values()) {
    if (!visible[group.id] || !Array.isArray(input[group.id])) continue
    out[group.id] = entriesOf(input, group.id).map((entry, i) => {
      const kept: Entry = {}
      for (const q of group.items) keep(q, entry, kept, `${group.id}.${i}.${q.id}`)
      return kept
    })
  }
  return out
}

const hiddenKey = (visible: Record<string, boolean>) => Object.keys(visible).filter(k => !visible[k]).sort().join('|')

export function evaluate(def: Definition, input: Answers, context: Context): Evaluation {
  const index = indexOf(def)
  // Steps 3 to 5, repeated until nothing changes. The publish checks guarantee it settles; the
  // bound is for a draft with a circle in it.
  let answers = clean(def, index, input, show(def, scopeFor(index, input, context)).visible)
  let scope = scopeFor(index, answers, context)
  let shown = show(def, scope)
  for (let turn = 0, before = ''; turn < index.questions.size + def.pages.length + 2; turn++) {
    const now = hiddenKey(shown.visible)
    if (now === before) break
    before = now
    answers = clean(def, index, input, shown.visible)
    scope = scopeFor(index, answers, context)
    shown = show(def, scope)
  }

  const required: Record<string, boolean> = {}
  const issues: Record<string, Issue[]> = {}
  const judge = (q: Question, path: string, values: Record<string, unknown>, inner: Scope) => {
    if (!shown.visible[path]) return
    required[path] = q.required === true || (typeof q.required === 'object' && holds(q.required, inner))
    const found = check(q, values[q.id] as Value, required[path], context, values[otherKey(q.id)])
    if (found.length) issues[path] = found
  }
  for (const { question, group } of index.questions.values()) if (!group) judge(question, question.id, answers, scope)
  for (const { group } of index.groups.values()) {
    if (!shown.visible[group.id]) continue
    const entries = entriesOf(answers, group.id)
    const count: Issue[] = []
    if (entries.length < (group.min ?? 0)) count.push({ rule: 'minEntries', params: { min: group.min! } })
    if (group.max !== undefined && entries.length > group.max) count.push({ rule: 'maxEntries', params: { max: group.max } })
    if (count.length) issues[group.id] = count
    entries.forEach((values, i) => {
      const inner = { ...scope, entry: { group: group.id, values } }
      for (const q of group.items) judge(q, `${group.id}.${i}.${q.id}`, values, inner)
    })
  }

  const calculated: Record<string, string | number | null> = {}
  for (const id of index.calculations.keys()) calculated[id] = scope.calculated(id)

  return { visible: shown.visible, required, issues, calculated, route: shown.route, ending: shown.ending, answers, valid: Object.keys(issues).length === 0 }
}

/** The paths on one page that have something wrong, for checking a page before moving on. */
export function issuesOnPage(def: Definition, evaluation: Evaluation, pageId: string): Record<string, Issue[]> {
  const page = def.pages.find(p => p.id === pageId)
  const out: Record<string, Issue[]> = {}
  if (!page) return out
  const owners = new Set<string>()
  for (const it of page.items) {
    if (it.kind === 'question' || it.kind === 'group') owners.add(it.id)
    if (it.kind === 'row') for (const q of it.items) owners.add(q.id)
  }
  for (const [path, found] of Object.entries(evaluation.issues)) if (owners.has(path.split('.')[0]!)) out[path] = found
  return out
}

/** Where Continue goes from a page: the next page on the route, an ending, or plain submission. */
export function nextStep(evaluation: Evaluation, pageId: string): { page: string } | { ending: Ending } | { submit: true } {
  const at = evaluation.route.indexOf(pageId)
  const next = evaluation.route[at + 1]
  if (at >= 0 && next) return { page: next }
  return evaluation.ending ? { ending: evaluation.ending } : { submit: true }
}
