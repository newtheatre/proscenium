import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { PASS_ADMISSION_MAP_KEY, reconcileCatalogue, transformCatalogue } from '#migration/catalogue'
import { PASS_ADMISSION_TICKET_TYPE_NAME } from '#shared/utils/ticket-types'
import { createTestDatabase, rows } from '#tests/helpers/database'
import type { CatalogueInput } from '#migration/catalogue'
import type { TestDatabase } from '#tests/helpers/database'

// The catalogues minted by id from the old estate (0075), proved against sources shaped like the
// real old rooms, training and proscenium schemas and the real migrations this repo builds.

function oldRooms(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, name TEXT NOT NULL, description TEXT, capacity INTEGER,
      is_active INTEGER DEFAULT 1 NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE external_venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, campus TEXT, building TEXT NOT NULL, room_name TEXT NOT NULL,
      contact_details TEXT, created_at INTEGER NOT NULL);
    INSERT INTO rooms (id, name, description, capacity, is_active, created_at) VALUES
      (1, 'The Studio', 'Our primary performance space.', 90, 1, 1759932657295),
      (2, 'Studio Foyer', NULL, 0, 0, 1759950545806);
    INSERT INTO external_venues (id, campus, building, room_name, contact_details, created_at) VALUES
      (1, 'University Park', 'Monica Partridge', 'B02', NULL, 1760019743003),
      (2, 'University Park', 'Pope', 'A13', 'Porters'' lodge', 1760966236903);
  `)
  return db
}

function oldTraining(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE departments (code TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, sort INTEGER DEFAULT 0 NOT NULL);
    CREATE TABLE modules (
      id TEXT PRIMARY KEY NOT NULL, department TEXT NOT NULL, kind TEXT DEFAULT 'MODULE' NOT NULL, name TEXT NOT NULL,
      description TEXT, notes TEXT, materials_url TEXT, expiry_mode TEXT DEFAULT 'NONE' NOT NULL, expiry_months INTEGER,
      safety_critical INTEGER DEFAULT 0 NOT NULL, signoff_required INTEGER DEFAULT 0 NOT NULL,
      grants_supervisor INTEGER DEFAULT 0 NOT NULL, grants_trainer INTEGER DEFAULT 0 NOT NULL,
      status TEXT DEFAULT 'DRAFT' NOT NULL, sort INTEGER DEFAULT 0 NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      allows_external INTEGER DEFAULT 0 NOT NULL, external_evidence TEXT);
    CREATE TABLE module_prerequisites (id TEXT PRIMARY KEY NOT NULL, module_id TEXT NOT NULL, requires_module_id TEXT NOT NULL);
    INSERT INTO departments (code, name, sort) VALUES ('NNT', 'Whole Theatre', 1), ('SFTY', 'Safety', 2);
    INSERT INTO modules (id, department, kind, name, description, notes, materials_url, expiry_mode, expiry_months,
      safety_critical, signoff_required, grants_supervisor, grants_trainer, status, sort, created_at, updated_at,
      allows_external, external_evidence) VALUES
      ('NNT-001', 'NNT', 'MODULE', 'Induction', 'Baseline for all members.', NULL, NULL, 'ACADEMIC_YEAR', NULL,
        0, 0, 0, 0, 'ACTIVE', 0, 1786737695000, 1786737695000, 0, NULL),
      ('NNT-002', 'NNT', 'BRIEF', 'Get-in Brief', 'Repeated at each get-in.', NULL, NULL, 'ACADEMIC_YEAR', NULL,
        0, 0, 0, 0, 'ACTIVE', 1, 1786737695000, 1786737695000, 0, NULL),
      ('SFTY-011', 'SFTY', 'MODULE', 'Manual Handling', NULL, 'Required before heavy work.', NULL, 'MONTHS', 36,
        1, 0, 0, 0, 'DRAFT', 2, 1786737695000, 1787208469000, 1, 'A dated certificate.');
    INSERT INTO module_prerequisites (id, module_id, requires_module_id) VALUES ('pre-1', 'SFTY-011', 'NNT-001');
  `)
  return db
}

function oldProscenium(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE ticket_types (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT, price INTEGER NOT NULL,
      active_by_default INTEGER DEFAULT 1 NOT NULL, created_at TEXT DEFAULT (current_timestamp) NOT NULL,
      updated_at TEXT NOT NULL, kind TEXT DEFAULT 'SINGLE' NOT NULL, archived INTEGER DEFAULT 0 NOT NULL, access_kind TEXT);
    INSERT INTO ticket_types (id, name, description, price, active_by_default, created_at, updated_at, kind, archived, access_kind) VALUES
      ('tt-adult', 'Adult', 'Standard full-price adult ticket', 1000, 1, '2025-10-28T22:36:59.395+00:00', '2026-03-05 03:07:46', 'SINGLE', 0, NULL),
      ('tt-legacy', 'Member (legacy)', 'Imported from legacy ticketing', 500, 0, '2026-08-10 09:23:33', '2026-08-10 09:23:33', 'SINGLE', 1, NULL),
      ('tt-sale', 'Season Ticket, NNT (sold)', NULL, 2500, 0, '2026-08-10 09:23:34', '2026-08-10 09:23:34', 'PASS_SALE', 0, NULL),
      ('tt-adm', 'Season Ticket (admission)', NULL, 0, 0, '2026-08-10 09:23:35', '2026-08-10 09:23:35', 'PASS_ADMISSION', 0, NULL);
  `)
  return db
}

interface Estate { rooms: Database, training: Database, proscenium: Database }

function oldEstate(): Estate {
  return { rooms: oldRooms(), training: oldTraining(), proscenium: oldProscenium() }
}

function freshMaps(): Pick<CatalogueInput, 'roomIds' | 'spaceIds' | 'ticketTypeIds'> {
  return { roomIds: new Map(), spaceIds: new Map(), ticketTypeIds: new Map() }
}

async function withTarget(fn: (target: TestDatabase) => void | Promise<void>): Promise<void> {
  const target = await createTestDatabase()
  try {
    await fn(target)
  }
  finally {
    target.close()
  }
}

describe('rooms and union venues are minted by old id (0075)', () => {
  test('a room keeps its name and capacity under a room:<id> key; a zero capacity is no capacity', async () => {
    const estate = oldEstate()
    await withTarget((target) => {
      const maps = freshMaps()
      const { summary } = transformCatalogue({ ...estate, ...maps, target: target.raw })
      expect(summary.rooms).toBe(2)
      expect([...maps.roomIds.keys()].sort()).toEqual(['room:1', 'room:2'])

      const studio = rows<{ name: string, capacity: number | null, is_active: number, created_at: number }>(
        target, 'SELECT name, capacity, is_active, created_at FROM rooms WHERE id = ?', maps.roomIds.get('room:1'))[0]
      expect(studio).toMatchObject({ name: 'The Studio', capacity: 90, is_active: 1, created_at: 1759932657 })
      const foyer = rows<{ capacity: number | null, is_active: number }>(
        target, 'SELECT capacity, is_active FROM rooms WHERE id = ?', maps.roomIds.get('room:2'))[0]
      expect(foyer).toMatchObject({ capacity: null, is_active: 0 })
    })
  })

  test('a union venue becomes an external space named "<building> <room_name>" under a venue:<id> key', async () => {
    const estate = oldEstate()
    await withTarget((target) => {
      const maps = freshMaps()
      const { summary } = transformCatalogue({ ...estate, ...maps, target: target.raw })
      expect(summary.spaces).toBe(2)
      expect([...maps.spaceIds.keys()].sort()).toEqual(['venue:1', 'venue:2'])

      const space = rows<{ name: string, campus: string, building: string, contact: string | null }>(
        target, 'SELECT name, campus, building, contact FROM external_spaces WHERE id = ?', maps.spaceIds.get('venue:2'))[0]
      expect(space).toEqual({ name: 'Pope A13', campus: 'University Park', building: 'Pope', contact: 'Porters\' lodge' })
    })
  })
})

describe('the training catalogue lands with the unified CHECKs honoured', () => {
  test('departments, modules and prerequisites all import', async () => {
    const estate = oldEstate()
    await withTarget((target) => {
      const { summary } = transformCatalogue({ ...estate, ...freshMaps(), target: target.raw })
      expect(summary).toMatchObject({ departments: 2, modules: 3, prerequisites: 1 })

      expect(rows<{ code: string }>(target, 'SELECT code FROM departments ORDER BY sort').map(row => row.code)).toEqual(['NNT', 'SFTY'])
      const handling = rows<{ expiry_mode: string, expiry_months: number, safety_critical: number, allows_external: number }>(
        target, 'SELECT expiry_mode, expiry_months, safety_critical, allows_external FROM modules WHERE id = ?', 'SFTY-011')[0]
      expect(handling).toEqual({ expiry_mode: 'MONTHS', expiry_months: 36, safety_critical: 1, allows_external: 1 })
      expect(rows(target, 'SELECT id FROM module_prerequisites WHERE module_id = ? AND requires_id = ?', 'SFTY-011', 'NNT-001')).toHaveLength(1)
    })
  })

  test('a brief carrying an academic-year expiry is coerced to NONE and named in the exceptions', async () => {
    const estate = oldEstate()
    await withTarget((target) => {
      const { summary, exceptions } = transformCatalogue({ ...estate, ...freshMaps(), target: target.raw })
      expect(summary.modulesCoerced).toBe(1)
      expect(exceptions.some(one => one.includes('NNT-002') && one.includes('brief with ACADEMIC_YEAR expiry'))).toBe(true)

      const brief = rows<{ kind: string, expiry_mode: string, expiry_months: number | null }>(
        target, 'SELECT kind, expiry_mode, expiry_months FROM modules WHERE id = ?', 'NNT-002')[0]
      expect(brief).toEqual({ kind: 'BRIEF', expiry_mode: 'NONE', expiry_months: null })
      const induction = rows<{ expiry_mode: string }>(target, 'SELECT expiry_mode FROM modules WHERE id = ?', 'NNT-001')[0]
      expect(induction?.expiry_mode).toBe('ACADEMIC_YEAR')
    })
  })
})

describe('only a ticket somebody buys is a ticket type (0073, 0074)', () => {
  test('SINGLE types import, PASS_SALE and PASS_ADMISSION are counted as skipped', async () => {
    const estate = oldEstate()
    await withTarget((target) => {
      const maps = freshMaps()
      const { summary } = transformCatalogue({ ...estate, ...maps, target: target.raw })
      expect(summary.ticketTypes).toBe(2)
      expect(summary.ticketTypesSkippedKind).toBe(2)
      expect(maps.ticketTypeIds.has('tt-adult')).toBe(true)
      expect(maps.ticketTypeIds.has('tt-legacy')).toBe(true)
      expect(maps.ticketTypeIds.has('tt-sale')).toBe(false)
      expect(maps.ticketTypeIds.has('tt-adm')).toBe(false)

      const adult = rows<{ name: string, price: number, kind: string, archived: number, active_by_default: number }>(
        target, 'SELECT name, price, kind, archived, active_by_default FROM ticket_types WHERE id = ?', maps.ticketTypeIds.get('tt-adult'))[0]
      expect(adult).toEqual({ name: 'Adult', price: 1000, kind: 'SINGLE', archived: 0, active_by_default: 1 })
      expect(rows(target, 'SELECT id FROM ticket_types WHERE name LIKE ?', 'Season Ticket%')).toHaveLength(0)
    })
  })

  test('exactly one Pass admission row exists, recorded under the pass-admission map key', async () => {
    const estate = oldEstate()
    await withTarget((target) => {
      const maps = freshMaps()
      transformCatalogue({ ...estate, ...maps, target: target.raw })

      const admission = rows<{ id: string, name: string, price: number }>(
        target, 'SELECT id, name, price FROM ticket_types WHERE kind = ?', 'PASS_ADMISSION')
      expect(admission).toHaveLength(1)
      expect(admission[0]).toMatchObject({ name: PASS_ADMISSION_TICKET_TYPE_NAME, price: 0 })
      expect(maps.ticketTypeIds.get(PASS_ADMISSION_MAP_KEY)).toBe(admission[0]!.id)
      expect(rows(target, 'SELECT id FROM ticket_types')).toHaveLength(3)
    })
  })
})

describe('a rehearsal runs again without doubling the catalogue', () => {
  test('the second run updates each row in place, same ids, same pass-admission row', async () => {
    const estate = oldEstate()
    await withTarget((target) => {
      const maps = freshMaps()
      transformCatalogue({ ...estate, ...maps, target: target.raw })
      const before = {
        rooms: rows<{ id: string }>(target, 'SELECT id FROM rooms ORDER BY id'),
        spaces: rows<{ id: string }>(target, 'SELECT id FROM external_spaces ORDER BY id'),
        types: rows<{ id: string }>(target, 'SELECT id FROM ticket_types ORDER BY id'),
      }

      estate.rooms.exec('UPDATE rooms SET name = \'The Studio (renamed)\' WHERE id = 1')
      estate.training.exec('UPDATE modules SET name = \'Induction (renamed)\' WHERE id = \'NNT-001\'')
      estate.proscenium.exec('UPDATE ticket_types SET price = 1100 WHERE id = \'tt-adult\'')
      const { summary } = transformCatalogue({ ...estate, ...maps, target: target.raw })

      expect(summary).toMatchObject({ rooms: 2, spaces: 2, departments: 2, modules: 3, prerequisites: 1, ticketTypes: 2 })
      expect(rows(target, 'SELECT id FROM rooms ORDER BY id')).toEqual(before.rooms)
      expect(rows(target, 'SELECT id FROM external_spaces ORDER BY id')).toEqual(before.spaces)
      expect(rows(target, 'SELECT id FROM ticket_types ORDER BY id')).toEqual(before.types)
      expect(rows(target, 'SELECT code FROM departments')).toHaveLength(2)
      expect(rows(target, 'SELECT id FROM modules')).toHaveLength(3)
      expect(rows(target, 'SELECT id FROM module_prerequisites')).toHaveLength(1)
      expect(rows(target, 'SELECT id FROM ticket_types WHERE kind = ?', 'PASS_ADMISSION')).toHaveLength(1)

      expect(rows<{ name: string }>(target, 'SELECT name FROM rooms WHERE id = ?', maps.roomIds.get('room:1'))[0]?.name).toBe('The Studio (renamed)')
      expect(rows<{ name: string }>(target, 'SELECT name FROM modules WHERE id = ?', 'NNT-001')[0]?.name).toBe('Induction (renamed)')
      expect(rows<{ price: number }>(target, 'SELECT price FROM ticket_types WHERE id = ?', maps.ticketTypeIds.get('tt-adult'))[0]?.price).toBe(1100)
    })
  })
})

describe('it reconciles', () => {
  test('a clean import reconciles, and a missing pass-admission row is a problem', async () => {
    const estate = oldEstate()
    await withTarget((target) => {
      const input = { ...estate, ...freshMaps(), target: target.raw }
      const { summary } = transformCatalogue(input)
      const check = reconcileCatalogue(input, summary)
      expect(check.problems).toEqual([])
      expect(check.ok).toBe(true)

      target.raw.exec('DELETE FROM ticket_types WHERE kind = \'PASS_ADMISSION\'')
      const broken = reconcileCatalogue(input, summary)
      expect(broken.ok).toBe(false)
      expect(broken.problems.some(one => one.includes('pass-admission'))).toBe(true)
    })
  })
})
