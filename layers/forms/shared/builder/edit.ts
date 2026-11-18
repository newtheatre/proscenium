// Editing a definition, as pure functions: each takes a definition and returns a new one, so the
// builder can keep every step for undo and redo, and so the same edits can be tested without a page.
import { conditionsOf, questionsOf } from '../engine/definition'
import type { Calculation, Condition, Content, DataClass, Definition, Group, Item, Operand, Page, Question, QuestionType, Row } from '../engine/types'
import { kindOfQuestion } from '../engine/values'

export const CHOICE_TYPES: readonly QuestionType[] = ['choice.single', 'choice.multiple', 'choice.dropdown', 'choice.ranking']
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Every id a definition uses, so a new one never collides. */
function ids(def: Definition): Set<string> {
  const out = new Set<string>()
  for (const page of def.pages) {
    out.add(page.id)
    for (const item of page.items) {
      out.add(item.id)
      if (item.kind === 'group' || item.kind === 'row') for (const q of item.items) out.add(q.id)
    }
  }
  for (const c of def.calculations ?? []) out.add(c.id)
  for (const e of def.endings ?? []) out.add(e.id)
  return out
}
const LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789'
const ID_LENGTH = 6
function random(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH))
  return [...bytes].map(b => LETTERS[b % LETTERS.length]).join('')
}
/** A new id no part of the definition uses. Ids last for the life of the form and are never reused. */
export function freshId(def: Definition, prefix: string): string {
  const taken = ids(def)
  let id = `${prefix}-${random()}`
  while (taken.has(id)) id = `${prefix}-${random()}`
  return id
}

const KEY_LENGTH = 40
/** A readable export name from a label: `What is your name?` becomes `what_is_your_name`, made unique. */
export function keyFrom(def: Definition, label: string, except?: string): string {
  const base = label.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z\d]+/g, '_').replace(/^[_\d]+|_+$/g, '').slice(0, KEY_LENGTH).replace(/_+$/, '') || 'question'
  const taken = new Set<string>()
  for (const { question } of questionsOf(def)) if (question.id !== except) taken.add(question.key)
  for (const page of def.pages) for (const item of page.items) if (item.kind === 'group' && item.id !== except) taken.add(item.key)
  for (const c of def.calculations ?? []) if (c.id !== except) taken.add(c.key)
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}

/** The data class a new question of this type starts with. An author may raise it. */
const CLASS: Partial<Record<QuestionType, DataClass>> = { 'email': 'personal', 'phone': 'personal', 'address': 'personal', 'text.long': 'free-text', 'file': 'personal', 'record': 'internal' }
const SCALE_TOP = 5

export function blankQuestion(def: Definition, type: QuestionType, label = ''): Question {
  const id = freshId(def, 'q')
  const q: Question = { kind: 'question', id, key: keyFrom(def, label || type.replace(/\W+/g, '_')), type, label, dataClass: CLASS[type] ?? 'internal' }
  if (CHOICE_TYPES.includes(type)) q.options = [{ id: 'o1', label: '' }, { id: 'o2', label: '' }]
  if (type === 'rating') q.scale = { max: SCALE_TOP }
  if (type === 'scale') q.scale = { min: 1, max: SCALE_TOP }
  return q
}
export const blankContent = (def: Definition): Content => ({ kind: 'content', id: freshId(def, 'c'), text: '' })
export const blankGroup = (def: Definition): Group => ({ kind: 'group', id: freshId(def, 'g'), key: keyFrom(def, 'group'), label: '', min: 0, items: [] })
export const blankPage = (def: Definition): Page => ({ id: freshId(def, 'page'), title: '', items: [] })

/** The next option id of a question: ids are never reused, so it is one past the highest ever seen here. */
export function nextOptionId(q: Question): string {
  const highest = Math.max(0, ...(q.options ?? []).map(o => Number(/^o(\d+)$/.exec(o.id)?.[1] ?? 0)))
  return `o${highest + 1}`
}

export type Found
  = | { kind: 'page', page: Page, pageIndex: number }
    | { kind: 'item', item: Item, page: Page, pageIndex: number, index: number }
    | { kind: 'inner', item: Question, parent: Group | Row, page: Page, pageIndex: number, index: number }

export function find(def: Definition, id: string): Found | null {
  for (const [pageIndex, page] of def.pages.entries()) {
    if (page.id === id) return { kind: 'page', page, pageIndex }
    for (const [index, item] of page.items.entries()) {
      if (item.id === id) return { kind: 'item', item, page, pageIndex, index }
      if (item.kind === 'group' || item.kind === 'row') {
        const inner = item.items.findIndex(q => q.id === id)
        if (inner >= 0) return { kind: 'inner', item: item.items[inner]!, parent: item, page, pageIndex, index: inner }
      }
    }
  }
  return null
}

/** Changes one page, item or inner question in place on a copy. */
export function change(def: Definition, id: string, edit: (target: any) => void): Definition {
  const next = copy(def)
  const found = find(next, id)
  if (found) edit(found.kind === 'page' ? found.page : found.item)
  return next
}

export function addPage(def: Definition, after?: string): { def: Definition, id: string } {
  const next = copy(def)
  const page = blankPage(next)
  const at = after ? next.pages.findIndex(p => p.id === after) + 1 : next.pages.length
  next.pages.splice(at || next.pages.length, 0, page)
  return { def: next, id: page.id }
}

export function movePage(def: Definition, id: string, to: number): Definition {
  const next = copy(def)
  const from = next.pages.findIndex(p => p.id === id)
  if (from < 0) return def
  const [page] = next.pages.splice(from, 1)
  next.pages.splice(Math.max(0, Math.min(to, next.pages.length)), 0, page!)
  return next
}

/** Adds an item to a page, or a question to a group, at an index (the end when left out). */
export function addItem(def: Definition, into: string, item: Item, index?: number): Definition {
  const next = copy(def)
  const found = find(next, into)
  if (found?.kind === 'page') found.page.items.splice(index ?? found.page.items.length, 0, item)
  else if (found?.kind === 'item' && found.item.kind === 'group' && item.kind === 'question') found.item.items.splice(index ?? found.item.items.length, 0, item)
  else return def
  return next
}

/** Takes an item out of wherever it is. A row left with one question becomes that question again. */
function take(def: Definition, id: string): Item | null {
  const found = find(def, id)
  if (!found || found.kind === 'page') return null
  if (found.kind === 'item') return found.page.items.splice(found.index, 1)[0]!
  if (found.parent.kind === 'group') return found.parent.items.splice(found.index, 1)[0]!
  const other = found.parent.items[found.index === 0 ? 1 : 0]
  const at = found.page.items.indexOf(found.parent)
  found.page.items.splice(at, 1, other)
  return found.item
}

export function removeItem(def: Definition, id: string): Definition {
  const next = copy(def)
  return take(next, id) ? next : def
}

export function removePage(def: Definition, id: string): Definition {
  if (def.pages.length < 2) return def
  const next = copy(def)
  next.pages = next.pages.filter(p => p.id !== id)
  for (const page of next.pages) page.routes = page.routes?.filter(r => !('page' in r.to && r.to.page === id))
  // A calculation shown on the page stays, shown nowhere, rather than pointing at nothing.
  for (const c of next.calculations ?? []) if (c.page === id) Reflect.deleteProperty(c, 'page')
  return next
}

/** Moves an item to an index of a page or group. A group or content cannot go inside a group. */
export function moveItem(def: Definition, id: string, into: string, index: number): Definition {
  const next = copy(def)
  const target = find(next, into)
  const group = target?.kind === 'item' && target.item.kind === 'group' ? target.item : null
  if (!target || (target.kind !== 'page' && !group)) return def
  const before = find(next, id)
  if (!before || before.kind === 'page') return def
  if (group && before.item.kind !== 'question') return def
  const item = take(next, id)!
  const list = (group ? group.items : (target as { page: Page }).page.items) as Item[]
  list.splice(Math.max(0, Math.min(index, list.length)), 0, item)
  return next
}

/** Puts two questions side by side: the dragged one joins the target as a row. */
export function pair(def: Definition, sourceId: string, targetId: string): Definition {
  if (sourceId === targetId) return def
  const next = copy(def)
  const target = find(next, targetId)
  const source = find(next, sourceId)
  if (target?.kind !== 'item' || target.item.kind !== 'question' || !source || source.kind === 'page' || source.item.kind !== 'question') return def
  const moved = take(next, sourceId) as Question
  const again = find(next, targetId)
  if (again?.kind !== 'item') return def
  const row: Row = { kind: 'row', id: freshId(next, 'row'), items: [again.item as Question, moved] }
  again.page.items.splice(again.index, 1, row)
  return next
}

/** Puts a row's two questions back on lines of their own. */
export function unpair(def: Definition, rowId: string): Definition {
  const next = copy(def)
  const found = find(next, rowId)
  if (found?.kind !== 'item' || found.item.kind !== 'row') return def
  found.page.items.splice(found.index, 1, ...found.item.items)
  return next
}

export function duplicate(def: Definition, id: string): { def: Definition, id: string } | null {
  const next = copy(def)
  const found = find(next, id)
  if (!found || found.kind === 'page' || found.item.kind !== 'question') return null
  const twin: Question = { ...copy(found.item), id: freshId(next, 'q') }
  twin.key = keyFrom(next, twin.label || twin.key)
  if (found.kind === 'item') found.page.items.splice(found.index + 1, 0, twin)
  else if (found.parent.kind === 'group') found.parent.items.splice(found.index + 1, 0, twin)
  else found.page.items.splice(found.page.items.indexOf(found.parent) + 1, 0, twin)
  return { def: next, id: twin.id }
}

// ---- what depends on what ----

function operands(c: Condition, out: Operand[] = []): Operand[] {
  if ('all' in c) c.all.forEach(x => operands(x, out))
  else if ('any' in c) c.any.forEach(x => operands(x, out))
  else if ('none' in c) c.none.forEach(x => operands(x, out))
  else out.push(c.left, ...(Array.isArray(c.right) ? c.right : c.right ? [c.right] : []))
  return out
}

/** The ids of everything whose logic reads this question: pages, items and calculations. Asked before a delete (FB-204). */
export function dependents(def: Definition, id: string): string[] {
  const out = new Set<string>()
  for (const { condition, owner } of conditionsOf(def)) {
    if (owner !== id && operands(condition).some(o => 'answer' in o && o.answer === id)) out.add(owner)
  }
  const reads = (e: unknown): boolean => {
    if (!e || typeof e !== 'object') return false
    const x = e as Record<string, unknown>
    if (x.answer === id || x.group === id || x.of === id) return true
    return Object.values(x).some(v => Array.isArray(v) ? v.some(reads) : reads(v))
  }
  for (const c of def.calculations ?? []) if (c.id !== id && reads(c.expression)) out.add(c.id)
  for (const { condition, owner } of conditionsOf(def)) {
    if (owner !== id && operands(condition).some(o => 'calculation' in o && o.calculation === id)) out.add(owner)
  }
  for (const c of def.calculations ?? []) if (c.id !== id && JSON.stringify(c.expression).includes(`"calculation":${JSON.stringify(id)}`)) out.add(c.id)
  return [...out]
}

/** The questions a condition on this page or item may read: those that come before it (FB-204). */
export function earlier(def: Definition, id: string): Question[] {
  const found = find(def, id)
  if (!found) return []
  const out: Question[] = []
  for (const [pageIndex, page] of def.pages.entries()) {
    if (pageIndex > found.pageIndex || (found.kind === 'page' && pageIndex === found.pageIndex)) break
    for (const item of page.items) {
      if (pageIndex === found.pageIndex && (item.id === id || (found.kind === 'inner' && item === found.parent && item.kind === 'row'))) return out
      if (item.kind === 'question') out.push(item)
      else if (item.kind === 'row') out.push(...item.items)
      else if (item.kind === 'group' && found.kind === 'inner' && item === found.parent) {
        // Inside a group, a question may read the ones before it in the same entry.
        out.push(...item.items.slice(0, found.index))
        return out
      }
    }
  }
  return out
}

// ---- calculations ----

/** A new calculation, shown on a page when one is given. It starts as nothing but a nought, which the author replaces. */
export function addCalculation(def: Definition, page?: string): { def: Definition, id: string } {
  const next = copy(def)
  const id = freshId(next, 'calc')
  const calculation: Calculation = { id, key: keyFrom(next, 'calculation'), type: 'number', label: '', expression: { value: 0 }, ...(page ? { page } : {}) }
  next.calculations = [...(next.calculations ?? []), calculation]
  return { def: next, id }
}

/** Changes one calculation in place on a copy. */
export function changeCalculation(def: Definition, id: string, edit: (c: Calculation) => void): Definition {
  const next = copy(def)
  const found = next.calculations?.find(c => c.id === id)
  if (!found) return def
  edit(found)
  return next
}

/** Takes a calculation out. Logic that read it then shows as a problem, as it does for a question. */
export function removeCalculation(def: Definition, id: string): Definition {
  if (!def.calculations?.some(c => c.id === id)) return def
  const next = copy(def)
  next.calculations = next.calculations!.filter(c => c.id !== id)
  if (!next.calculations.length) Reflect.deleteProperty(next, 'calculations')
  return next
}

/** Moves a calculation up or down the list, which is the order they are shown in on a page. */
export function moveCalculation(def: Definition, id: string, by: number): Definition {
  const list = def.calculations ?? []
  const from = list.findIndex(c => c.id === id)
  const to = from + by
  if (from < 0 || to < 0 || to >= list.length) return def
  const next = copy(def)
  const [moved] = next.calculations!.splice(from, 1)
  next.calculations!.splice(to, 0, moved!)
  return next
}

/** The export name follows the label until the form is published or the author writes their own. */
export function labelCalculation(def: Definition, id: string, label: string, follow: boolean): Definition {
  return changeCalculation(def, id, (c) => {
    const follows = follow && c.key === keyFrom(def, c.label || 'calculation', c.id)
    c.label = label
    if (follows) c.key = keyFrom(def, label || 'calculation', c.id)
  })
}

/** The calculations shown on one page, in their order. */
export const calculationsOn = (def: Definition, page: string): Calculation[] => (def.calculations ?? []).filter(c => c.page === page)

/**
 * What a calculation's formula may read: questions with a number for an answer that are not inside a
 * repeating group, the number questions of each group (to total) and the groups (to count), and the
 * other calculations that give a number.
 */
export function calculationInputs(def: Definition, self?: string): { questions: Question[], groups: { group: Group, numbers: Question[] }[], calculations: Calculation[] } {
  const questions: Question[] = []
  const groups: { group: Group, numbers: Question[] }[] = []
  for (const { question, group } of questionsOf(def)) if (!group && kindOfQuestion(question) === 'number') questions.push(question)
  for (const page of def.pages) for (const item of page.items) if (item.kind === 'group') groups.push({ group: item, numbers: item.items.filter(q => kindOfQuestion(q) === 'number') })
  const calculations = (def.calculations ?? []).filter(c => c.id !== self && ['number', 'money', 'percent'].includes(c.type))
  return { questions, groups, calculations }
}
