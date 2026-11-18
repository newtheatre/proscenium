// Verification lists (tab 2; rules V4, V5, V10, V13, V15, V18, V19): an uploaded file of addresses
// or references, such as a students' union's export of student IDs, end dates and names. Each value
// is kept only as a keyed hash; nobody can read the list back out. A name is kept in the clear for
// staff, one entry at a time.
import { all, credential, first, refuse } from '#kit'

export const LIST_KEY = 'MEMBERSHIP_LIST_KEY'

export interface ListRow {
  id: string
  name: string
  keyKind: 'email' | 'reference'
  entryCount: number
  validUntil: string | null
  referenceLabel: string | null
  referenceShape: Shape | null
  uploadedAt: number
}

/** What a well-formed reference looks like (V15). Never a free pattern. */
export interface Shape { kind: 'digits' | 'letters-and-digits', min: number, max: number }

const LIST_COLUMNS = `id, name, key_kind AS keyKind, entry_count AS entryCount, valid_until AS validUntil, reference_label AS referenceLabel,
  reference_shape AS referenceShape, uploaded_at AS uploadedAt`

function toList(row: Record<string, unknown>): ListRow {
  return { ...row, referenceShape: row.referenceShape ? JSON.parse(String(row.referenceShape)) as Shape : null } as ListRow
}

export async function getList(id: string | undefined): Promise<ListRow | null> {
  if (!id) return null
  const row = await first<Record<string, unknown>>(`SELECT ${LIST_COLUMNS} FROM membership_verification_lists WHERE id = ?`, id)
  return row ? toList(row) : null
}

export async function requireList(id: string | undefined): Promise<ListRow> {
  const list = await getList(id)
  if (!list) refuse('core.not-found', 'There is no such list.', { status: 404 })
  return list!
}

export async function listLists(): Promise<ListRow[]> {
  return (await all<Record<string, unknown>>(`SELECT ${LIST_COLUMNS} FROM membership_verification_lists ORDER BY name`)).map(toList)
}

/** The value as it is compared: trimmed and lower-cased, and a reference without spaces. */
export function normalise(kind: ListRow['keyKind'], value: string): string {
  const text = value.trim().toLowerCase()
  return kind === 'reference' ? text.replace(/\s+/g, '') : text
}

/** Whether a typed reference has the list's shape: tells a mistyped one from one not on the list. */
export function wellFormed(shape: Shape | null, value: string): boolean {
  if (!shape) return value.length > 0
  const pattern = shape.kind === 'digits' ? /^\d+$/ : /^[a-z0-9]+$/ // not-policy: character classes
  return pattern.test(value) && value.length >= shape.min && value.length <= shape.max
}

let keyCache: { secret: string, key: CryptoKey } | undefined

/** Refuses while the list key is not set: the list verifier stays unavailable until then. */
async function hmacKey(): Promise<CryptoKey> {
  const secret = await credential(LIST_KEY)
  if (!secret) refuse('membership.list.no-key', 'Verification lists need a list key, which has not been set.', { status: 409, remedy: 'Save a list key under Keys on Membership > Lists (any long random string).' })
  if (keyCache?.secret !== secret) keyCache = { secret: secret!, key: await crypto.subtle.importKey('raw', new TextEncoder().encode(secret!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']) }
  return keyCache.key
}

export async function hasListKey(): Promise<boolean> {
  return !!(await credential(LIST_KEY))
}

/** The keyed hash of a normalised value, as hex. The plain value is never stored (V10). */
export async function hashValue(kind: ListRow['keyKind'], value: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(normalise(kind, value))))
  return [...mac].map(b => b.toString(16).padStart(2, '0')).join('') // not-policy: hex digits
}

export interface ParsedRow { value: string, endsOn: string | null, name: string | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/ // not-policy: the shape of a date
const UK_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/ // not-policy: day/month/year as spreadsheets write it

export function dateOf(text: string): string | null | undefined {
  const t = text.trim()
  if (!t) return null
  const uk = UK_DATE.exec(t)
  const iso = DATE.test(t) ? t : uk ? `${uk[3]}-${uk[2]!.padStart(2, '0')}-${uk[1]!.padStart(2, '0')}` : null
  // A date that does not exist, such as 31 February, is not read as another.
  const parsed = iso ? new Date(`${iso}T00:00:00Z`) : null
  return parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(iso!) ? iso : undefined
}

/** Splits one CSV line, honouring double quotes. */
export function cells(line: string): string[] {
  const out: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      }
      else if (c === '"') quoted = false
      else cell += c
    }
    else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(cell)
      cell = ''
    }
    else cell += c
  }
  out.push(cell)
  return out
}

/**
 * Reads a file of up to three columns: the address or reference, the date the entitlement ends, and
 * the holder's name (MEM-20, MEM-57). A first line that is not a value is taken as headings.
 * Returns the rows and, for each refused line, its number and why.
 */
export function parseFile(kind: ListRow['keyKind'], shape: Shape | null, text: string): { rows: ParsedRow[], refused: { line: number, reason: string }[] } {
  const rows: ParsedRow[] = []
  const refused: { line: number, reason: string }[] = []
  const seen = new Set<string>()
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  lines.forEach((raw, index) => {
    if (!raw.trim()) return
    const [first = '', second = '', third = ''] = cells(raw)
    const value = normalise(kind, first)
    const ok = kind === 'email' ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) : wellFormed(shape, value)
    if (!ok) {
      if (index === 0) return // headings
      refused.push({ line: index + 1, reason: kind === 'email' ? 'not-an-address' : 'not-well-formed' })
      return
    }
    const endsOn = dateOf(second)
    if (endsOn === undefined) {
      refused.push({ line: index + 1, reason: 'bad-date' })
      return
    }
    if (seen.has(value)) {
      refused.push({ line: index + 1, reason: 'repeated' })
      return
    }
    seen.add(value)
    rows.push({ value, endsOn, name: third.trim().slice(0, 120) || null }) // not-policy: the specification's bound on a name
  })
  return { rows, refused }
}

/** An entry that matches a value on a day: on the list, not past its end, and the list still valid. */
export async function findEntry(list: ListRow, value: string, day: string): Promise<{ id: string, endsOn: string | null, usedBy: string | null } | null> {
  if (list.validUntil && list.validUntil < day) return null
  const hash = await hashValue(list.keyKind, value)
  return first<{ id: string, endsOn: string | null, usedBy: string | null }>(
    'SELECT id, ends_on AS endsOn, used_by AS usedBy FROM membership_verification_entries WHERE list_id = ?1 AND key_hash = ?2 AND (ends_on IS NULL OR ends_on >= ?3)',
    list.id, hash, day,
  )
}

/**
 * D9: whether a list's entries carry their own end dates, which then decide when a membership
 * verified against it ends. A length chosen alongside would be ignored, so none is asked for.
 */
export async function listSetsEnd(list: ListRow | null): Promise<boolean> {
  if (!list) return false
  return !!(await first<{ x: number }>('SELECT 1 AS x FROM membership_verification_entries WHERE list_id = ? AND ends_on IS NOT NULL LIMIT 1', list.id))
}

/** The scheme's reference list, from its verifier configuration, when it checks against one. */
export async function schemeList(scheme: { verifier: string | null, verifierConfig?: string | null }): Promise<ListRow | null> {
  if (scheme.verifier !== 'membership.list' || !scheme.verifierConfig) return null
  const config = JSON.parse(scheme.verifierConfig) as { listId?: string }
  return getList(config.listId)
}
