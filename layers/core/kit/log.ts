// Structured logging with the request id. Fields named after a personal, free-text or special
// column anywhere in the registry are replaced, so a row passed whole never leaks a person.
import { currentContext } from './context-store'
import { withoutTokens } from './tokens'

let personal: Set<string> | undefined

/** Called when the registry is installed: every column name whose class could identify a person. */
export function setPersonalFields(names: Iterable<string>): void {
  personal = new Set(names)
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value // not-policy: how deep a log line is scrubbed
  if (Array.isArray(value)) return value.map(v => scrub(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) out[k] = personal?.has(k) ? '[personal]' : scrub(v, depth + 1)
  return out
}

function write(level: 'debug' | 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}) {
  const context = currentContext()
  const line = { level, message, requestId: context?.requestId, ...(scrub(fields) as object) }
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  out(withoutTokens(JSON.stringify(line)))
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
}
