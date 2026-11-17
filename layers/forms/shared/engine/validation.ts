// Checking one answer (part 3, "Validation"). The same rules run in the browser and on the server
// from the same definition, and the server's answer is the one that counts. An issue names its rule;
// the words shown are the theatre's own message where the rule has one, the platform's otherwise.
import { OTHER, PATTERNS } from './types'
import type { Address, Context, FileRef, Issue, Question, Rule, Value } from './types'
import { addDays, isDate, isDateTime, isEmpty, isTime } from './values'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^\+?[\d\s().-]{6,24}$/
function isUrl(s: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(s).protocol) }
  catch { return false }
}

/** Whether a question has no answer. Ticking a consent is its only answer, so `false` is empty there. */
export function unanswered(q: Question, value: unknown): boolean {
  if (q.type === 'consent') return value !== true
  return isEmpty(value)
}

const wrong: Issue = { rule: 'type' }
/** Whether the value is the right shape for its question, before any of the author's rules. */
function shape(q: Question, value: unknown, other: unknown): Issue | null {
  const options = new Set((q.options ?? []).map(o => o.id))
  const oneOption = (v: unknown) => typeof v === 'string' && (options.has(v) || (q.allowOther === true && v === OTHER))
  const many = (v: unknown, each: (x: unknown) => boolean) => Array.isArray(v) && v.every(each) && new Set(v).size === v.length
  const needsOther = (chosen: boolean): Issue | null => (chosen && isEmpty(other) ? { rule: 'other' } : null)
  switch (q.type) {
    case 'text.short':
    case 'text.long': return typeof value === 'string' ? null : wrong
    case 'email': return typeof value === 'string' && EMAIL.test(value.trim()) ? null : wrong
    case 'phone': return typeof value === 'string' && PHONE.test(value.trim()) ? null : wrong
    case 'url': return typeof value === 'string' && isUrl(value.trim()) ? null : wrong
    case 'number': return typeof value === 'number' && Number.isFinite(value) ? null : wrong
    case 'money': return typeof value === 'number' && Number.isSafeInteger(value) ? null : wrong
    case 'date': return isDate(value) ? null : wrong
    case 'time': return isTime(value) ? null : wrong
    case 'datetime': return isDateTime(value) ? null : wrong
    case 'yesno': return typeof value === 'boolean' ? null : wrong
    case 'consent': return value === true ? null : wrong
    case 'rating':
    case 'scale': {
      const min = q.type === 'rating' ? 1 : q.scale?.min ?? 0
      const max = q.scale?.max ?? 5
      return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? null : wrong
    }
    case 'choice.single': return oneOption(value) ? needsOther(value === OTHER) : { rule: 'option' }
    case 'choice.dropdown':
      if (!q.multiple) return oneOption(value) ? needsOther(value === OTHER) : { rule: 'option' }
      return many(value, oneOption) ? needsOther((value as string[]).includes(OTHER)) : { rule: 'option' }
    case 'choice.multiple': return many(value, oneOption) ? needsOther((value as string[]).includes(OTHER)) : { rule: 'option' }
    case 'choice.ranking': return many(value, v => typeof v === 'string' && options.has(v)) && (value as string[]).length === options.size ? null : { rule: 'option' }
    case 'record': {
      const one = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 100
      return (q.multiple ? many(value, one) : one(value)) ? null : wrong
    }
    case 'address': {
      const a = value as Address
      const filled = (v: unknown) => typeof v === 'string' && v.trim() !== ''
      return a && typeof a === 'object' && !Array.isArray(a) && filled(a.line1) && filled(a.town) && filled(a.postcode) ? null : wrong
    }
    case 'file':
      return Array.isArray(value) && value.every(f => f && typeof f === 'object' && typeof (f as FileRef).id === 'string' && typeof (f as FileRef).name === 'string' && typeof (f as FileRef).size === 'number') ? null : wrong
  }
}

function broken(rule: Rule, q: Question, value: Value, context: Context): Record<string, string | number> | null {
  const n = typeof rule.value === 'number' ? rule.value : null
  const length = typeof value === 'string' ? value.trim().length : Array.isArray(value) ? value.length : null
  switch (rule.rule) {
    case 'minLength': return typeof value === 'string' && n !== null && length! < n ? { min: n, length: length! } : null
    case 'maxLength': return typeof value === 'string' && n !== null && length! > n ? { max: n, length: length! } : null
    case 'min': return typeof value === 'number' && n !== null && value < n ? { min: n } : null
    case 'max': return typeof value === 'number' && n !== null && value > n ? { max: n } : null
    case 'whole': return typeof value === 'number' && !Number.isInteger(value) ? {} : null
    case 'minDate':
    case 'maxDate': {
      if (typeof value !== 'string' || value.length < 10) return null
      const bound = typeof rule.value === 'string' ? rule.value : rule.value && typeof rule.value === 'object' && 'today' in rule.value ? addDays(context.today, rule.value.today) : null
      if (!bound) return null
      const day = value.slice(0, 10)
      return (rule.rule === 'minDate' ? day < bound.slice(0, 10) : day > bound.slice(0, 10)) ? { date: bound.slice(0, 10) } : null
    }
    case 'minChosen': return Array.isArray(value) && n !== null && length! < n ? { min: n } : null
    case 'maxChosen': return Array.isArray(value) && n !== null && length! > n ? { max: n } : null
    case 'pattern': {
      const pattern = typeof rule.value === 'string' ? PATTERNS[rule.value as keyof typeof PATTERNS] : undefined
      return typeof value === 'string' && pattern && !pattern.test(value.trim()) ? { pattern: rule.value as string } : null
    }
    case 'regex': {
      if (typeof value !== 'string' || typeof rule.value !== 'string') return null
      try { return new RegExp(rule.value, 'u').test(value) ? null : {} }
      catch { return null }
    }
    case 'fileTypes': {
      if (q.type !== 'file' || !Array.isArray(rule.value)) return null
      const allowed = rule.value.map(t => t.toLowerCase())
      const fits = (f: FileRef) => allowed.some(t => (t.startsWith('.') ? f.name.toLowerCase().endsWith(t) : t.endsWith('/*') ? f.type.toLowerCase().startsWith(t.slice(0, -1)) : f.type.toLowerCase() === t))
      return (value as FileRef[]).every(fits) ? null : { types: allowed.join(', ') }
    }
    case 'maxFileSize': return q.type === 'file' && n !== null && (value as FileRef[]).some(f => f.size > n) ? { max: n } : null
    case 'maxFiles': return q.type === 'file' && n !== null && length! > n ? { max: n } : null
  }
}

/** Everything wrong with one visible question's answer. `other` is the text of its "Other" answer. */
export function check(q: Question, value: Value, required: boolean, context: Context, other?: unknown): Issue[] {
  if (unanswered(q, value)) return required ? [{ rule: 'required' }] : []
  const misshapen = shape(q, value, other)
  if (misshapen) return [misshapen]
  const issues: Issue[] = []
  for (const rule of q.validation ?? []) {
    const params = broken(rule, q, value, context)
    if (params) issues.push({ rule: rule.rule, ...(rule.message ? { message: rule.message } : {}), ...(Object.keys(params).length ? { params } : {}) })
  }
  return issues
}
