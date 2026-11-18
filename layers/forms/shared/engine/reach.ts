// What can be told from a definition alone about whether a condition can ever hold, and so whether
// a page or question can ever be shown (part 3's two warnings). It reports only what is certain:
// a condition it cannot decide is left alone, so a warning here is never a false alarm.
import type { Comparison, Condition, Definition, Operand } from './types'

export type Certainty = 'always' | 'never' | 'depends'

const answerOf = (o: Operand): string | null => ('answer' in o ? o.answer : null)
const fixed = (o: Operand | Operand[] | undefined): string | null => {
  if (!o || Array.isArray(o)) return null
  if ('option' in o) return `o:${o.option}`
  if ('value' in o) return `v:${typeof o.value}:${String(o.value).trim().toLocaleLowerCase('en')}`
  return null
}

/** Two comparisons of one answer that cannot both hold: answered and empty, is and is not the same thing, is two different things. */
function contradict(a: Comparison, b: Comparison): boolean {
  const subject = answerOf(a.left)
  if (!subject || subject !== answerOf(b.left)) return false
  const pair = (x: string, y: string) => (a.op === x && b.op === y) || (a.op === y && b.op === x)
  if (pair('answered', 'empty')) return true
  if (pair('is', 'empty')) return true
  const [va, vb] = [fixed(a.right), fixed(b.right)]
  if (va === null || vb === null) return false
  if (pair('is', 'is-not')) return va === vb
  return a.op === 'is' && b.op === 'is' && va !== vb
}

export function certainty(c: Condition): Certainty {
  if ('all' in c) {
    const parts = c.all.map(certainty)
    if (parts.includes('never')) return 'never'
    const leaves = c.all.filter((x): x is Comparison => 'op' in x)
    if (leaves.some((a, i) => leaves.slice(i + 1).some(b => contradict(a, b)))) return 'never'
    return parts.every(p => p === 'always') ? 'always' : 'depends'
  }
  if ('any' in c) {
    const parts = c.any.map(certainty)
    if (parts.includes('always')) return 'always'
    return parts.every(p => p === 'never') ? 'never' : 'depends'
  }
  if ('none' in c) {
    const parts = c.none.map(certainty)
    if (parts.includes('always')) return 'never'
    return parts.every(p => p === 'never') ? 'always' : 'depends'
  }
  return 'depends'
}

export interface Unreached { at: string, why: 'condition' | 'route', required: boolean }

/**
 * Pages that no route leads to, and pages, groups, content and questions whose own condition can
 * never hold. Something inside a page that is never reached is not listed again.
 */
export function unreached(def: Definition): Unreached[] {
  const out: Unreached[] = []
  const position = new Map(def.pages.map((p, i) => [p.id, i]))
  const reached = new Set<number>([0])
  def.pages.forEach((page, i) => {
    if (!reached.has(i)) return
    let falls = true
    for (const route of page.routes ?? []) {
      const sure = certainty(route.when)
      if (sure === 'never') continue
      if ('page' in route.to) {
        const to = position.get(route.to.page)
        if (to !== undefined && to > i) reached.add(to)
      }
      if (sure === 'always') {
        falls = false
        break
      }
    }
    // A page hidden by its condition is passed over, so the page after it is reached all the same.
    if (falls && i + 1 < def.pages.length) reached.add(i + 1)
  })
  def.pages.forEach((page, i) => {
    if (!reached.has(i)) return void out.push({ at: page.id, why: 'route', required: false })
    if (page.visibleWhen && certainty(page.visibleWhen) === 'never') return void out.push({ at: page.id, why: 'condition', required: false })
    for (const item of page.items) {
      if (item.kind === 'row') {
        for (const q of item.items) if (q.visibleWhen && certainty(q.visibleWhen) === 'never') out.push({ at: q.id, why: 'condition', required: q.required !== undefined && q.required !== false })
        continue
      }
      if (item.visibleWhen && certainty(item.visibleWhen) === 'never') {
        out.push({ at: item.id, why: 'condition', required: item.kind === 'question' && item.required !== undefined && item.required !== false })
        continue
      }
      if (item.kind === 'group') {
        for (const q of item.items) if (q.visibleWhen && certainty(q.visibleWhen) === 'never') out.push({ at: q.id, why: 'condition', required: q.required !== undefined && q.required !== false })
      }
    }
  })
  return out
}
