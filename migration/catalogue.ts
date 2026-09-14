// The catalogues the other transforms key to, minted from the old estate by id rather than
// authored by hand and matched by name (0075): rooms, union venues, training, ticket types.
import { idFor, nanoid } from './lib'
import { PASS_ADMISSION_TICKET_TYPE_NAME } from '../shared/utils/ticket-types'
import type { Database } from 'bun:sqlite'

export interface CatalogueInput {
  rooms: Database
  training: Database
  proscenium: Database
  // Keyed `room:<id>` and `venue:<id>`, the shape bookings.ts already reads.
  roomIds: Map<string, string>
  spaceIds: Map<string, string>
  // Keyed on the raw old id, the shape reservations.ts already reads.
  ticketTypeIds: Map<string, string>
  target: Database
}

export interface CatalogueSummary {
  rooms: number
  spaces: number
  departments: number
  modules: number
  modulesCoerced: number
  prerequisites: number
  ticketTypes: number
  ticketTypesSkippedKind: number
  [key: string]: number
}

// The one row every pass admission shares: minted here so it exists from day one, found by kind
// by the redemption path afterwards (0074).
export const PASS_ADMISSION_MAP_KEY = 'pass-admission'

const seconds = (ms: number | null): number | null => (ms === null ? null : ms >= 10_000_000_000 ? Math.floor(ms / 1000) : ms)

interface OldRoom { id: number, name: string, description: string | null, capacity: number | null, is_active: number, created_at: number }
interface OldVenue { id: number, campus: string | null, building: string, room_name: string, contact_details: string | null, created_at: number }
interface OldDepartment { code: string, name: string, sort: number }
interface OldModule {
  id: string
  department: string
  kind: string
  name: string
  description: string | null
  notes: string | null
  expiry_mode: string
  expiry_months: number | null
  safety_critical: number
  signoff_required: number
  grants_supervisor: number
  grants_trainer: number
  status: string
  sort: number
  created_at: number
  updated_at: number
  allows_external: number
  external_evidence: string | null
}
interface OldPrerequisite { module_id: string, requires_module_id: string }
interface OldTicketType {
  id: string
  name: string
  description: string | null
  price: number
  active_by_default: number
  kind: string
  archived: number
  access_kind: string | null
}

export function passAdmissionTicketTypeId(target: Database): string {
  const held = target.query<{ id: string }, []>('SELECT id FROM ticket_types WHERE kind = \'PASS_ADMISSION\' LIMIT 1').get()
  if (held) return held.id
  const id = nanoid()
  target.query('INSERT INTO ticket_types (id, name, price, kind) VALUES (?, ?, 0, \'PASS_ADMISSION\')').run(id, PASS_ADMISSION_TICKET_TYPE_NAME)
  return id
}

export function transformCatalogue(input: CatalogueInput): { summary: CatalogueSummary, exceptions: string[] } {
  const { rooms, training, proscenium, roomIds, spaceIds, ticketTypeIds, target } = input
  const exceptions: string[] = []
  const summary: CatalogueSummary = {
    rooms: 0, spaces: 0, departments: 0, modules: 0, modulesCoerced: 0, prerequisites: 0, ticketTypes: 0, ticketTypesSkippedKind: 0,
  }

  const insertRoom = target.prepare(`
    INSERT INTO rooms (id, name, description, capacity, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      name = excluded.name, description = excluded.description, capacity = excluded.capacity,
      is_active = excluded.is_active, updated_at = excluded.updated_at
  `)
  for (const room of rooms.query('SELECT * FROM rooms ORDER BY id').all() as OldRoom[]) {
    const created = seconds(room.created_at) ?? 0
    insertRoom.run(idFor(roomIds, `room:${room.id}`), room.name, room.description, room.capacity && room.capacity > 0 ? room.capacity : null, room.is_active, created, created)
    summary.rooms++
  }

  const insertSpace = target.prepare(`
    INSERT INTO external_spaces (id, name, campus, building, contact, capacity, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      name = excluded.name, campus = excluded.campus, building = excluded.building, contact = excluded.contact,
      updated_at = excluded.updated_at
  `)
  for (const venue of rooms.query('SELECT * FROM external_venues ORDER BY id').all() as OldVenue[]) {
    const created = seconds(venue.created_at) ?? 0
    insertSpace.run(idFor(spaceIds, `venue:${venue.id}`), `${venue.building} ${venue.room_name}`.trim(), venue.campus, venue.building, venue.contact_details, created, created)
    summary.spaces++
  }

  const insertDepartment = target.prepare(`
    INSERT INTO departments (code, name, sort) VALUES (?, ?, ?)
    ON CONFLICT (code) DO UPDATE SET name = excluded.name, sort = excluded.sort
  `)
  for (const department of training.query('SELECT * FROM departments ORDER BY sort').all() as OldDepartment[]) {
    insertDepartment.run(department.code, department.name, department.sort)
    summary.departments++
  }

  const insertModule = target.prepare(`
    INSERT INTO modules
      (id, department, kind, name, description, notes, delivery_mode, expiry_mode, expiry_months, allows_external,
       external_evidence, safety_critical, signoff_required, grants_trainer, grants_supervisor, self_registrable,
       status, sort, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'IN_PERSON', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      department = excluded.department, kind = excluded.kind, name = excluded.name, description = excluded.description,
      notes = excluded.notes, expiry_mode = excluded.expiry_mode, expiry_months = excluded.expiry_months,
      allows_external = excluded.allows_external, external_evidence = excluded.external_evidence,
      safety_critical = excluded.safety_critical, signoff_required = excluded.signoff_required,
      grants_trainer = excluded.grants_trainer, grants_supervisor = excluded.grants_supervisor,
      status = excluded.status, sort = excluded.sort, updated_at = excluded.updated_at
  `)
  for (const module of training.query('SELECT * FROM modules ORDER BY sort, id').all() as OldModule[]) {
    // The unified CHECKs: a months policy carries a number and nothing else does, and a brief
    // never expires. A row breaking either is written with the policy it can hold, and named.
    let expiryMode = module.expiry_mode
    let expiryMonths = module.expiry_months
    if (expiryMode === 'MONTHS' && (expiryMonths === null || expiryMonths <= 0 || expiryMonths > 120)) {
      exceptions.push(`module ${module.id}: MONTHS expiry with months ${expiryMonths}, imported as NONE`)
      expiryMode = 'NONE'
      expiryMonths = null
      summary.modulesCoerced++
    }
    else if (expiryMode !== 'MONTHS' && expiryMonths !== null) {
      exceptions.push(`module ${module.id}: ${expiryMode} expiry carried months ${expiryMonths}, months dropped`)
      expiryMonths = null
      summary.modulesCoerced++
    }
    if (module.kind === 'BRIEF' && expiryMode !== 'NONE') {
      exceptions.push(`module ${module.id}: a brief with ${expiryMode} expiry, imported as NONE`)
      expiryMode = 'NONE'
      expiryMonths = null
      summary.modulesCoerced++
    }
    insertModule.run(
      module.id, module.department, module.kind, module.name, module.description, module.notes,
      expiryMode, expiryMonths, module.allows_external ?? 0, module.external_evidence,
      module.safety_critical, module.signoff_required, module.grants_trainer, module.grants_supervisor,
      module.status, module.sort, seconds(module.created_at) ?? 0, seconds(module.updated_at) ?? 0,
    )
    summary.modules++
  }

  const insertPrerequisite = target.prepare(`
    INSERT INTO module_prerequisites (id, module_id, requires_id) VALUES (?, ?, ?)
    ON CONFLICT (module_id, requires_id) DO NOTHING
  `)
  const moduleIds = new Set((training.query('SELECT id FROM modules').all() as { id: string }[]).map(row => row.id))
  for (const edge of training.query('SELECT module_id, requires_module_id FROM module_prerequisites').all() as OldPrerequisite[]) {
    if (edge.module_id === edge.requires_module_id || !moduleIds.has(edge.module_id) || !moduleIds.has(edge.requires_module_id)) {
      exceptions.push(`prerequisite ${edge.module_id} requires ${edge.requires_module_id}: not a pair of imported modules, dropped`)
      continue
    }
    insertPrerequisite.run(nanoid(), edge.module_id, edge.requires_module_id)
    summary.prerequisites++
  }

  // Only a ticket somebody buys is a ticket type here: an old pass sale becomes a pass, and every
  // pass admission shares the system's own row (passes.ts, 0073, 0074).
  const insertTicketType = target.prepare(`
    INSERT INTO ticket_types (id, name, description, price, kind, access_kind, restricted_to, archived, active_by_default)
    VALUES (?, ?, ?, ?, 'SINGLE', ?, NULL, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      name = excluded.name, description = excluded.description, price = excluded.price,
      access_kind = excluded.access_kind, archived = excluded.archived, active_by_default = excluded.active_by_default
  `)
  for (const type of proscenium.query('SELECT * FROM ticket_types ORDER BY created_at, id').all() as OldTicketType[]) {
    if (type.kind !== 'SINGLE') {
      summary.ticketTypesSkippedKind++
      continue
    }
    insertTicketType.run(idFor(ticketTypeIds, type.id), type.name, type.description, Math.max(type.price, 0), type.access_kind, type.archived, type.active_by_default)
    summary.ticketTypes++
  }
  ticketTypeIds.set(PASS_ADMISSION_MAP_KEY, passAdmissionTicketTypeId(target))

  return { summary, exceptions }
}

export interface Reconciliation { ok: boolean, problems: string[] }

export function reconcileCatalogue(input: CatalogueInput, summary: CatalogueSummary): Reconciliation {
  const problems: string[] = []
  const n = (db: Database, sql: string): number => (db.query(sql).get() as { n: number }).n
  const pairs: [string, number, number][] = [
    ['rooms', n(input.rooms, 'SELECT count(*) n FROM rooms'), n(input.target, 'SELECT count(*) n FROM rooms')],
    ['external_spaces', n(input.rooms, 'SELECT count(*) n FROM external_venues'), n(input.target, 'SELECT count(*) n FROM external_spaces')],
    ['departments', n(input.training, 'SELECT count(*) n FROM departments'), n(input.target, 'SELECT count(*) n FROM departments')],
    ['modules', n(input.training, 'SELECT count(*) n FROM modules'), n(input.target, 'SELECT count(*) n FROM modules')],
    ['ticket_types', summary.ticketTypes + 1, n(input.target, 'SELECT count(*) n FROM ticket_types')],
  ]
  for (const [table, expected, landed] of pairs) {
    if (landed < expected) problems.push(`${table}: expected ${expected}, ${landed} in the target`)
  }
  if (n(input.target, 'SELECT count(*) n FROM ticket_types WHERE kind = \'PASS_ADMISSION\'') !== 1) {
    problems.push('ticket_types: exactly one pass-admission row is expected')
  }
  return { ok: problems.length === 0, problems }
}
