// Ticket types (Box office specification, part 2, box_office_ticket_types). A theatre makes the
// ordinary ones, such as Full price and Concession. A type whose rules a module needs, such as the
// access scheme's Companion, Box office's own Complimentary or Membership's Member, is declared by
// that module through the point box-office.ticket-type and kept here: the module owns its kind, its
// requirements and whether it needs a paid ticket beside it, and people only rename, order, retire
// and price it. Switching the module off withholds the type. Nobody makes a companion or
// complimentary type by hand.
import { sql } from 'drizzle-orm'
import { all, createUnit, first, idSchema, newId, nowMs, refuse, requirements, usePoint, type UnitView } from '#kit'

export const KINDS = ['standard', 'concession', 'companion', 'complimentary'] as const
export type Kind = (typeof KINDS)[number]
/** Kinds only a module may declare: each changes how the type is sold. */
export const MANAGED_KINDS: readonly Kind[] = ['companion', 'complimentary']

/** One declaration on box-office.ticket-type. The contribution's id is the type's key in its module. */
export interface TicketTypeDecl {
  id: string
  name: string
  kind: Kind
  requirementRefs?: string[]
  needsPaidTicket?: boolean
  maxPerHolder?: number
  recheckAtEntry?: boolean
  proofNote?: string
  sort?: number
}

interface Row {
  id: string
  name: string
  kind: Kind
  requirement_refs: string | null
  recheck_at_entry: number
  max_per_holder: number
  proof_note: string | null
  needs_paid_ticket: number
  active: number
  managed_by: string | null
  sort: number
}

export interface TicketType {
  id: string
  name: string
  kind: Kind
  requirementRefs: string[]
  maxPerHolder: number
  recheckAtEntry: boolean
  proofNote: string | null
  needsPaidTicket: boolean
  active: boolean
  sort: number
  /** The module that keeps this type, or null for one a person made. */
  managedBy: string | null
  /** False when the module that keeps it is off, so it is not sold. */
  available: boolean
  /** Whether anything has been sold or priced under it, so it can only be retired, not deleted. */
  used: boolean
}

const refsOf = (text: string | null): string[] => {
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : []
  }
  catch {
    return []
  }
}
const refsText = (refs: readonly string[] | undefined): string | null => (refs?.length ? JSON.stringify([...refs]) : null)

/** A ticket type's id from an address, or the same answer as an unknown one. */
export function ticketTypeId(value: string | undefined): string {
  const parsed = idSchema('tty').safeParse(value)
  if (!parsed.success) refuse('box-office.ticket-type.not-found', 'There is no such ticket type.', { status: 404 })
  return parsed.data
}

/** Every declaration from modules that are on, by `<module>.<id>`. */
export async function declaredTypes(): Promise<Map<string, TicketTypeDecl & { module: string }>> {
  const out = new Map<string, TicketTypeDecl & { module: string }>()
  for (const c of await usePoint<TicketTypeDecl>('box-office.ticket-type')) out.set(`${c.module}.${c.value.id}`, { ...c.value, module: c.module })
  return out
}

const rulesOf = (d: TicketTypeDecl) => ({
  kind: d.kind,
  refs: refsText(d.requirementRefs),
  needsPaid: (d.needsPaidTicket ?? d.kind === 'companion') ? 1 : 0,
  max: d.maxPerHolder ?? 1,
  recheck: (d.recheckAtEntry ?? true) ? 1 : 0,
})

/**
 * Makes or brings up to date the types the modules that are on declare. An existing type a person
 * made is taken over when it has the declared name, or, for a companion or complimentary type, is
 * the oldest of that kind, so a theatre that already had one keeps its prices and history. Adds
 * to `unit` when given; otherwise commits its own, and only when something has to change.
 */
export async function ensureManagedTicketTypes(given?: UnitView): Promise<void> {
  const declared = await declaredTypes()
  if (!declared.size) return
  const rows = await all<Row>('SELECT * FROM box_office_ticket_types ORDER BY created_at, id')
  const own = given ? null : createUnit()
  const unit = given ?? own!.view()
  let changed = false
  const at = nowMs()
  const taken = new Set<string>()
  for (const [key, d] of declared) {
    const r = rulesOf(d)
    const existing = rows.find(row => row.managed_by === key)
    if (existing) {
      if (existing.kind !== r.kind || existing.requirement_refs !== r.refs || existing.needs_paid_ticket !== r.needsPaid || existing.max_per_holder !== r.max || existing.recheck_at_entry !== r.recheck) {
        unit.add(sql`UPDATE box_office_ticket_types SET kind = ${r.kind}, requirement_refs = ${r.refs}, needs_paid_ticket = ${r.needsPaid}, max_per_holder = ${r.max}, recheck_at_entry = ${r.recheck}, updated_at = ${at} WHERE id = ${existing.id} AND managed_by = ${key}`)
        changed = true
      }
      continue
    }
    const adopt = rows.find(row => !row.managed_by && !taken.has(row.id) && row.name.toLowerCase() === d.name.toLowerCase())
      ?? (MANAGED_KINDS.includes(d.kind) ? rows.find(row => !row.managed_by && !taken.has(row.id) && row.kind === d.kind) : undefined)
    if (adopt) {
      taken.add(adopt.id)
      unit.add(sql`UPDATE box_office_ticket_types SET managed_by = ${key}, kind = ${r.kind}, requirement_refs = ${r.refs}, needs_paid_ticket = ${r.needsPaid}, max_per_holder = ${r.max}, recheck_at_entry = ${r.recheck}, updated_at = ${at}
        WHERE id = ${adopt.id} AND managed_by IS NULL`)
      unit.audit({ action: 'update', record: ['box-office.ticket-type', adopt.id], detail: { managedBy: key } })
      changed = true
      continue
    }
    // A clash with a type of another kind keeps both: the declared one is told apart by its module.
    const name = rows.some(row => row.name.toLowerCase() === d.name.toLowerCase()) ? `${d.name} (${d.module})` : d.name
    const id = newId('tty')
    unit.add(sql`INSERT INTO box_office_ticket_types (id, name, kind, requirement_refs, recheck_at_entry, max_per_holder, proof_note, needs_paid_ticket, active, managed_by, sort, created_at, updated_at)
      SELECT ${id}, ${name}, ${r.kind}, ${r.refs}, ${r.recheck}, ${r.max}, ${d.proofNote ?? null}, ${r.needsPaid}, 1, ${key}, ${d.sort ?? 0}, ${at}, ${at}
      WHERE NOT EXISTS (SELECT 1 FROM box_office_ticket_types WHERE managed_by = ${key} OR name = ${name})`)
    unit.audit({ action: 'create', record: ['box-office.ticket-type', id], detail: { managedBy: key } })
    changed = true
  }
  if (own && changed) await own.commit()
}

function toType(r: Row, declared: Map<string, unknown>, used: Set<string>): TicketType {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    requirementRefs: refsOf(r.requirement_refs),
    maxPerHolder: r.max_per_holder,
    recheckAtEntry: !!r.recheck_at_entry,
    proofNote: r.proof_note,
    needsPaidTicket: !!r.needs_paid_ticket,
    active: !!r.active,
    sort: r.sort,
    managedBy: r.managed_by,
    available: !r.managed_by || declared.has(r.managed_by),
    used: used.has(r.id),
  }
}

/** Every type, in the order the theatre set. */
export async function listTicketTypes(): Promise<TicketType[]> {
  const [rows, declared, used] = await Promise.all([
    all<Row>('SELECT * FROM box_office_ticket_types ORDER BY sort, name COLLATE NOCASE'),
    declaredTypes(),
    all<{ id: string }>('SELECT DISTINCT ticket_type_id AS id FROM box_office_order_lines WHERE ticket_type_id IS NOT NULL UNION SELECT DISTINCT ticket_type_id FROM box_office_prices'),
  ])
  const usedIds = new Set(used.map(u => u.id))
  return rows.map(r => toType(r, declared, usedIds))
}

/** The types a sale may use, by id: active, and kept by a module that is on if kept by one. */
export async function sellableTypes(): Promise<Map<string, TicketType>> {
  const [rows, declared] = await Promise.all([all<Row>('SELECT * FROM box_office_ticket_types WHERE active = 1'), declaredTypes()])
  return new Map(rows.map(r => toType(r, declared, new Set())).filter(t => t.available).map(t => [t.id, t]))
}

/** The type a module declared, by its key, such as box-office.complimentary. */
export async function managedType(key: string): Promise<{ id: string, name: string } | null> {
  if (!(await declaredTypes()).has(key)) return null
  return await first<{ id: string, name: string }>('SELECT id, name FROM box_office_ticket_types WHERE managed_by = ? AND active = 1', key) ?? null
}

/** Refuses a list of references when one of them names no requirement anything provides. */
async function checkRefs(refs: readonly string[]): Promise<void> {
  if (!refs.length) return
  const known = await requirements.describe(refs)
  const unknown = refs.filter(r => !known[r])
  if (unknown.length) refuse('box-office.ticket-type.unknown-requirement', 'One of those requirements is not provided by anything switched on.', { status: 422, fields: { requirementRefs: 'unknown' }, remedy: 'Choose requirements from the list.' })
}

export interface TicketTypeInput {
  name: string
  kind?: 'standard' | 'concession'
  proofNote?: string | null
  requirementRefs?: string[]
  maxPerHolder?: number
  recheckAtEntry?: boolean
  sort?: number
}

export async function createTicketType(unit: UnitView, input: TicketTypeInput): Promise<string> {
  await checkRefs(input.requirementRefs ?? [])
  const id = newId('tty')
  const at = nowMs()
  unit.add(sql`INSERT INTO box_office_ticket_types (id, name, kind, requirement_refs, recheck_at_entry, max_per_holder, proof_note, needs_paid_ticket, active, sort, created_at, updated_at)
    SELECT ${id}, ${input.name}, ${input.kind ?? 'standard'}, ${refsText(input.requirementRefs)}, ${(input.recheckAtEntry ?? true) ? 1 : 0}, ${input.maxPerHolder ?? 1}, ${input.proofNote ?? null}, 0, 1, ${input.sort ?? 0}, ${at}, ${at}
    WHERE NOT EXISTS (SELECT 1 FROM box_office_ticket_types WHERE name = ${input.name} COLLATE NOCASE)`)
    .expect(1, { code: 'box-office.ticket-type.name-taken', reason: 'There is already a ticket type with that name.' })
  unit.audit({ action: 'create', record: ['box-office.ticket-type', id] })
  return id
}

export interface TicketTypeChange {
  name?: string
  proofNote?: string | null
  active?: boolean
  sort?: number
  kind?: 'standard' | 'concession'
  requirementRefs?: string[]
  maxPerHolder?: number
  recheckAtEntry?: boolean
}

const RULES: (keyof TicketTypeChange)[] = ['kind', 'requirementRefs', 'maxPerHolder', 'recheckAtEntry']

/**
 * Changes a type. Anyone with the ability may rename, reorder, retire or bring back any type; the
 * rules of a type a module keeps are the module's, so changing them is refused. Orders already
 * written keep the name and price they were sold under in their own lines.
 */
export async function updateTicketType(unit: UnitView, id: string, change: TicketTypeChange): Promise<void> {
  const row = await first<Row>('SELECT * FROM box_office_ticket_types WHERE id = ?', id)
  if (!row) refuse('box-office.ticket-type.not-found', 'There is no such ticket type.', { status: 404 })
  const rules = RULES.filter(k => change[k] !== undefined)
  if (row.managed_by && rules.length)
    refuse('box-office.ticket-type.managed', 'This ticket type is kept by a module, so who it is for and its limits are set there.', { status: 409, remedy: 'You can rename it, change its order, retire it or set its prices.' })
  if (MANAGED_KINDS.includes(row.kind) && change.kind)
    refuse('box-office.ticket-type.managed', 'Companion and complimentary tickets are kept by a module.', { status: 409 })
  if (change.requirementRefs) await checkRefs(change.requirementRefs)
  const at = nowMs()
  const sets = [sql`updated_at = ${at}`]
  if (change.name !== undefined) sets.push(sql`name = ${change.name}`)
  if (change.proofNote !== undefined) sets.push(sql`proof_note = ${change.proofNote}`)
  if (change.active !== undefined) sets.push(sql`active = ${change.active ? 1 : 0}`)
  if (change.sort !== undefined) sets.push(sql`sort = ${change.sort}`)
  if (change.kind !== undefined) sets.push(sql`kind = ${change.kind}`)
  if (change.requirementRefs !== undefined) sets.push(sql`requirement_refs = ${refsText(change.requirementRefs)}`)
  if (change.maxPerHolder !== undefined) sets.push(sql`max_per_holder = ${change.maxPerHolder}`)
  if (change.recheckAtEntry !== undefined) sets.push(sql`recheck_at_entry = ${change.recheckAtEntry ? 1 : 0}`)
  const name = change.name ?? row.name
  unit.add(sql`UPDATE box_office_ticket_types SET ${sql.join(sets, sql`, `)} WHERE id = ${id}
    AND NOT EXISTS (SELECT 1 FROM box_office_ticket_types WHERE name = ${name} COLLATE NOCASE AND id <> ${id})`)
    .expect(1, { code: 'box-office.ticket-type.name-taken', reason: 'There is already a ticket type with that name.' })
  unit.audit({ action: 'update', record: ['box-office.ticket-type', id], detail: { fields: Object.keys(change).filter(k => change[k as keyof TicketTypeChange] !== undefined) } })
}

/** Deletes a type a person made that nothing has been sold or priced under. Anything else is retired instead. */
export function deleteTicketType(unit: UnitView, id: string): void {
  unit.add(sql`DELETE FROM box_office_ticket_types WHERE id = ${id} AND managed_by IS NULL
    AND NOT EXISTS (SELECT 1 FROM box_office_order_lines WHERE ticket_type_id = ${id})
    AND NOT EXISTS (SELECT 1 FROM box_office_prices WHERE ticket_type_id = ${id})`)
    .expect(1, { code: 'box-office.ticket-type.in-use', reason: 'This ticket type has been priced, sold or is kept by a module, so it cannot be deleted.', remedy: 'Retire it instead: it stops being sold and stays in reports.' })
  unit.audit({ action: 'delete', record: ['box-office.ticket-type', id] })
}
