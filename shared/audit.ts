// The shape of an audit entry, and the guard that keeps personal data out of it. The table is
// append-only (0010) and erasure must never need to reach its content (0011).

// Long enough for an identifier or a status, too short for prose.
export const MAX_DETAIL_STRING = 120

// Lowercase, dotted, at least noun.verb. Reports group by this, so a typo must not quietly
// create a new category.
const ACTION = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/

// Anything shaped like an address, wherever it appears.
const ADDRESS = /[^\s@]+@[^\s@]+\.[^\s@]+/

// Keys whose whole purpose is prose. A value under one of these is free text by definition.
const FREE_TEXT_KEYS = new Set([
  'note', 'notes', 'reason', 'comment', 'comments', 'message', 'body',
  'citation', 'description', 'text', 'summary', 'feedback',
])

export type AuditDetail = Record<string, unknown>

export interface AuditInput {
  // NULL is the system acting on its own, such as a sweep.
  actorId: string | null
  action: string
  target?: string | null
  detail?: AuditDetail
}

export interface AuditRow {
  id: string
  actorId: string | null
  action: string
  target: string | null
  detail: AuditDetail | null
}

function guardDetail(value: unknown, path: string): void {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return

  if (typeof value === 'string') {
    if (ADDRESS.test(value)) {
      throw new Error(`audit detail ${path} looks like an address: audit detail carries identifiers, never people (0011)`)
    }
    if (value.length > MAX_DETAIL_STRING) {
      throw new Error(`audit detail ${path} is too long at ${value.length} characters: the limit is ${MAX_DETAIL_STRING} (0011)`)
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => guardDetail(item, `${path}[${index}]`))
    return
  }

  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (FREE_TEXT_KEYS.has(key.toLowerCase())) {
        throw new Error(`audit detail ${path}.${key} is a free text key: that belongs on the record itself, not in the audit trail (0011)`)
      }
      guardDetail(nested, `${path}.${key}`)
    }
    return
  }

  throw new Error(`audit detail ${path} is a ${typeof value}, which cannot be recorded`)
}

// Returns the row to insert. It is deliberately not a write: atomicity is batch only, so the
// caller puts this in the same batch as the change it records (0001, 0003).
export function auditEntry(input: AuditInput): AuditRow {
  if (!ACTION.test(input.action)) {
    throw new Error(`audit action \`${input.action}\` must be lowercase and dotted, as in role.granted`)
  }
  guardDetail(input.detail ?? {}, 'detail')

  return {
    id: crypto.randomUUID().replaceAll('-', ''),
    actorId: input.actorId,
    action: input.action,
    target: input.target ?? null,
    detail: input.detail ?? null,
  }
}
