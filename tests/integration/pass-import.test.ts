import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { passAdmissionTicketTypeId } from '#migration/catalogue'
import { reconcilePasses, transformPasses } from '#migration/passes'
import { transformReservations } from '#migration/reservations'
import { createTestDatabase, rows } from '#tests/helpers/database'
import { ticketTypeFixture, tonightsPerformance } from '#tests/helpers/programme'
import type { PassesInput } from '#migration/passes'
import type { ReservationResult } from '#migration/reservations'
import type { TestDatabase } from '#tests/helpers/database'

// Passes reconstructed from the old estate's odd tickets (0073): a PASS_SALE ticket becomes a pass
// and never a seat, a PASS_ADMISSION ticket lands on the system's own row (0074) and joins a pass.

const SALE_TYPE = 'tt-sale'
const ADMISSION_TYPE = 'tt-adm'
const OLD_TICKET_TYPES = [
  { id: SALE_TYPE, name: 'Season Ticket, NNT (sold)' },
  { id: ADMISSION_TYPE, name: 'Season Ticket (admission)' },
]

// Committee year 2017/18 throughout: sold in the October, admitted in the March.
const SOLD_AT = Date.UTC(2017, 9, 1, 12) / 1000
const ADMITTED_AT = Date.UTC(2018, 2, 1, 19, 30) / 1000
const PERFORMANCE_AT = Date.UTC(2018, 2, 4, 19, 30) / 1000
const NOW = Date.UTC(2026, 8, 14, 12) / 1000

function oldEstate(): Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE reservations (
      id TEXT PRIMARY KEY, user_id TEXT, performance_id TEXT,
      status TEXT NOT NULL, source TEXT NOT NULL,
      customer_notes TEXT, staff_notes TEXT, cancelled_by TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE tickets (
      id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL, ticket_type_id TEXT,
      price_paid INTEGER NOT NULL, refunded_at INTEGER, created_at INTEGER NOT NULL,
      price_confidence TEXT NOT NULL DEFAULT 'EXACT');
  `)
  return db
}

function placeReservation(db: Database, id: string, createdAt: number, userId: string | null = 'old-user-1'): void {
  db.query(`
    INSERT INTO reservations (id, user_id, performance_id, status, source, created_at)
    VALUES (?, ?, 'perf-1', 'COLLECTED', 'DESK', ?)
  `).run(id, userId, createdAt)
}

function placeTicket(db: Database, id: string, reservationId: string, typeId: string, price: number, createdAt: number): void {
  db.query('INSERT INTO tickets (id, reservation_id, ticket_type_id, price_paid, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, reservationId, typeId, price, createdAt)
}

// One sale on its own reservation, then a standard seat and a pass admission on one reservation,
// then a second admission to the same performance for the same holder.
function seedHolderHistory(source: Database): void {
  placeReservation(source, 'r-sale', SOLD_AT)
  placeTicket(source, 't-sale', 'r-sale', SALE_TYPE, 2500, SOLD_AT)
  placeReservation(source, 'r-1', ADMITTED_AT)
  placeTicket(source, 't-std', 'r-1', 'tt-1', 900, ADMITTED_AT)
  placeTicket(source, 't-adm1', 'r-1', ADMISSION_TYPE, 0, ADMITTED_AT)
  placeReservation(source, 'r-2', ADMITTED_AT + 60)
  placeTicket(source, 't-adm2', 'r-2', ADMISSION_TYPE, 0, ADMITTED_AT + 60)
}

interface Estate {
  target: TestDatabase
  performanceId: string
  showId: string
  admissionTicketTypeId: string
}

async function targetWithEstate(): Promise<Estate> {
  const target = await createTestDatabase()
  ticketTypeFixture(target)
  const tonight = tonightsPerformance(target)
  target.batch([
    ['INSERT INTO users (id, email, name, verified) VALUES (?, ?, ?, 1)', 'new-user-1', 'a@example.invalid', 'A Member'],
  ])
  const admissionTicketTypeId = passAdmissionTicketTypeId(target.raw)
  return { target, performanceId: tonight.performanceId, showId: tonight.showId, admissionTicketTypeId }
}

interface Maps {
  reservationIds: Map<string, string>
  ticketIds: Map<string, string>
  passTypeIds: Map<string, string>
  passPriceIds: Map<string, string>
  passIds: Map<string, string>
  admissionIds: Map<string, string>
}

function freshMaps(): Maps {
  return {
    reservationIds: new Map(), ticketIds: new Map(), passTypeIds: new Map(),
    passPriceIds: new Map(), passIds: new Map(), admissionIds: new Map(),
  }
}

function runReservations(source: Database, estate: Estate, maps: Maps): ReservationResult {
  return transformReservations({
    source,
    accounts: new Map([['old-user-1', 'new-user-1']]),
    performances: new Map([['perf-1', estate.performanceId]]),
    ticketTypes: new Map([['tt-1', 'tt-standard']]),
    reservationIds: maps.reservationIds,
    ticketIds: maps.ticketIds,
    passSaleTypes: new Set([SALE_TYPE]),
    passAdmissionTypes: new Set([ADMISSION_TYPE]),
    passAdmissionTicketTypeId: estate.admissionTicketTypeId,
    target: estate.target.raw,
  })
}

function passesInput(estate: Estate, maps: Maps, result: ReservationResult): PassesInput {
  return {
    sales: result.passSales,
    admissions: result.passAdmissions,
    oldTicketTypes: OLD_TICKET_TYPES,
    performances: new Map([[estate.performanceId, { startsAt: PERFORMANCE_AT, showId: estate.showId }]]),
    passTypeIds: maps.passTypeIds,
    passPriceIds: maps.passPriceIds,
    passIds: maps.passIds,
    admissionIds: maps.admissionIds,
    target: estate.target.raw,
    now: NOW,
  }
}

describe('a pass sale is not a seat, a pass admission is a seat on the system\'s own row', () => {
  test('a reservation holding only a PASS_SALE ticket is skipped, counted and writes no ticket', async () => {
    const source = oldEstate()
    placeReservation(source, 'r-sale', SOLD_AT)
    placeTicket(source, 't-sale', 'r-sale', SALE_TYPE, 2500, SOLD_AT)
    const estate = await targetWithEstate()

    try {
      const { summary, passSales } = runReservations(source, estate, freshMaps())
      expect(summary.skippedPassSaleOnly).toBe(1)
      expect(summary.written).toBe(0)
      expect(summary.ticketsWritten).toBe(0)
      expect(summary.passSales).toBe(1)
      expect(rows(estate.target, 'SELECT id FROM reservations')).toHaveLength(0)
      expect(rows(estate.target, 'SELECT id FROM tickets')).toHaveLength(0)
      expect(passSales).toEqual([{ oldTicketId: 't-sale', oldTicketTypeId: SALE_TYPE, userId: 'new-user-1', pricePaid: 2500, soldAt: SOLD_AT }])
    }
    finally {
      estate.target.close()
    }
  })

  test('a PASS_ADMISSION ticket lands on the given ticket type at 0p and is handed on as a seat', async () => {
    const source = oldEstate()
    placeReservation(source, 'r-1', ADMITTED_AT)
    placeTicket(source, 't-adm1', 'r-1', ADMISSION_TYPE, 0, ADMITTED_AT)
    const estate = await targetWithEstate()

    try {
      const maps = freshMaps()
      const { summary, passAdmissions } = runReservations(source, estate, maps)
      expect(summary.written).toBe(1)
      expect(summary.ticketsWritten).toBe(1)
      expect(summary.passAdmissions).toBe(1)

      const [ticket] = rows<{ id: string, ticket_type_id: string, price_paid: number, price_source: string }>(
        estate.target, 'SELECT id, ticket_type_id, price_paid, price_source FROM tickets')
      expect(ticket).toMatchObject({ ticket_type_id: estate.admissionTicketTypeId, price_paid: 0, price_source: 'IMPORT' })
      expect(passAdmissions).toEqual([{
        oldTicketId: 't-adm1', oldTicketTypeId: ADMISSION_TYPE, ticketId: maps.ticketIds.get('t-adm1')!,
        performanceId: estate.performanceId, userId: 'new-user-1', admittedAt: ADMITTED_AT,
      }])
    }
    finally {
      estate.target.close()
    }
  })

  test('a negative price on an admission or a sale is clamped to 0p and counted', async () => {
    const source = oldEstate()
    placeReservation(source, 'r-1', ADMITTED_AT)
    placeTicket(source, 't-adm1', 'r-1', ADMISSION_TYPE, -100, ADMITTED_AT)
    placeReservation(source, 'r-sale', SOLD_AT)
    placeTicket(source, 't-sale', 'r-sale', SALE_TYPE, -50, SOLD_AT)
    const estate = await targetWithEstate()

    try {
      const { summary, passSales } = runReservations(source, estate, freshMaps())
      expect(summary.negativePriceClamped).toBe(2)
      expect(rows<{ price_paid: number }>(estate.target, 'SELECT price_paid FROM tickets')[0]?.price_paid).toBe(0)
      expect(passSales[0]?.pricePaid).toBe(0)
    }
    finally {
      estate.target.close()
    }
  })
})

describe('passes are reconstructed per product per committee year (0073)', () => {
  test('one sale and two admissions become a closed pass type, two price points, two passes and two admissions', async () => {
    const source = oldEstate()
    seedHolderHistory(source)
    const estate = await targetWithEstate()

    try {
      const maps = freshMaps()
      const result = runReservations(source, estate, maps)
      expect(result.summary).toMatchObject({ written: 2, skippedPassSaleOnly: 1, ticketsWritten: 3, passSales: 1, passAdmissions: 2 })

      const input = passesInput(estate, maps, result)
      const { summary, exceptions } = transformPasses(input)
      expect(exceptions).toEqual([])
      expect(summary).toMatchObject({
        passTypes: 1, pricePoints: 2, passes: 2, passesFromSales: 1, passesFromAdmissionsOnly: 1,
        passesForOverflowAdmissions: 1, salesWithoutHolder: 0, admissionsWritten: 2, admissionsWithoutHolder: 0, salePence: 2500,
      })

      const [type] = rows<{ id: string, name: string, slug: string, status: string, valid_from: number, valid_until: number }>(
        estate.target, 'SELECT id, name, slug, status, valid_from, valid_until FROM pass_types')
      expect(type).toMatchObject({ name: 'Season Ticket 2017/18', slug: 'season-ticket-2017-2018', status: 'CLOSED' })
      expect(type!.valid_from).toBeLessThan(SOLD_AT)
      expect(type!.valid_until).toBeGreaterThan(PERFORMANCE_AT)
      expect(type!.valid_until).toBeLessThan(NOW)

      const prices = rows<{ label: string, price: number, pass_type_id: string }>(
        estate.target, 'SELECT label, price, pass_type_id FROM pass_type_prices ORDER BY label')
      expect(prices).toEqual([
        { label: 'Sale not recorded', price: 0, pass_type_id: type!.id },
        { label: '£25.00, NNT (imported)', price: 2500, pass_type_id: type!.id },
      ])

      const passes = rows<{ id: string, user_id: string, price_paid: number, status: string, issued_by: string | null, notes: string | null, created_at: number }>(
        estate.target, 'SELECT id, user_id, price_paid, status, issued_by, notes, created_at FROM passes ORDER BY price_paid DESC')
      expect(passes).toHaveLength(2)
      expect(passes[0]).toMatchObject({ user_id: 'new-user-1', price_paid: 2500, status: 'EXPIRED', issued_by: null, notes: null, created_at: SOLD_AT })
      expect(passes[1]).toMatchObject({ user_id: 'new-user-1', price_paid: 0, status: 'EXPIRED', issued_by: null, created_at: ADMITTED_AT + 60 })
      expect(passes[1]!.notes).toContain('no sale recorded')

      const admissions = rows<{ pass_id: string, performance_id: string, ticket_id: string, admitted_by: string | null }>(
        estate.target, 'SELECT pass_id, performance_id, ticket_id, admitted_by FROM pass_admissions ORDER BY admitted_at')
      expect(admissions.map(row => row.ticket_id)).toEqual([maps.ticketIds.get('t-adm1')!, maps.ticketIds.get('t-adm2')!])
      expect(admissions.map(row => row.pass_id)).toEqual([passes[0]!.id, passes[1]!.id])
      expect(admissions.every(row => row.performance_id === estate.performanceId && row.admitted_by === null)).toBe(true)

      expect(rows<{ show_id: string }>(estate.target, 'SELECT show_id FROM pass_type_shows')).toEqual([{ show_id: estate.showId }])

      const check = reconcilePasses(estate.target.raw, input, summary)
      expect(check.problems).toEqual([])
      expect(check.ok).toBe(true)
    }
    finally {
      estate.target.close()
    }
  })

  test('two sales at different prices are two price points, both labelled imported', async () => {
    const source = oldEstate()
    placeReservation(source, 'r-sale-1', SOLD_AT)
    placeTicket(source, 't-sale-1', 'r-sale-1', SALE_TYPE, 2500, SOLD_AT)
    placeReservation(source, 'r-sale-2', SOLD_AT + 60)
    placeTicket(source, 't-sale-2', 'r-sale-2', SALE_TYPE, 2000, SOLD_AT + 60)
    const estate = await targetWithEstate()

    try {
      const maps = freshMaps()
      const result = runReservations(source, estate, maps)
      const { summary } = transformPasses(passesInput(estate, maps, result))
      expect(summary).toMatchObject({ passTypes: 1, pricePoints: 2, passes: 2, passesFromSales: 2, salePence: 4500 })
      expect(rows<{ label: string }>(estate.target, 'SELECT label FROM pass_type_prices ORDER BY label').map(row => row.label))
        .toEqual(['£20.00, NNT (imported)', '£25.00, NNT (imported)'])
    }
    finally {
      estate.target.close()
    }
  })

  test('a sale naming nobody is not reconstructed, and says so', async () => {
    const source = oldEstate()
    placeReservation(source, 'r-sale', SOLD_AT, null)
    placeTicket(source, 't-sale', 'r-sale', SALE_TYPE, 2500, SOLD_AT)
    const estate = await targetWithEstate()

    try {
      const maps = freshMaps()
      const result = runReservations(source, estate, maps)
      const input = passesInput(estate, maps, result)
      const { summary, exceptions } = transformPasses(input)
      expect(summary).toMatchObject({ passes: 0, salesWithoutHolder: 1 })
      expect(exceptions.some(one => one.includes('t-sale') && one.includes('no holder'))).toBe(true)
      expect(reconcilePasses(estate.target.raw, input, summary).ok).toBe(true)
    }
    finally {
      estate.target.close()
    }
  })
})

describe('a rehearsal runs again without doubling the passes', () => {
  test('the same history imported twice leaves one of each pass, same references', async () => {
    const source = oldEstate()
    seedHolderHistory(source)
    const estate = await targetWithEstate()

    try {
      const maps = freshMaps()
      const first = runReservations(source, estate, maps)
      transformPasses(passesInput(estate, maps, first))
      const before = rows<{ id: string, reference: string }>(estate.target, 'SELECT id, reference FROM passes ORDER BY id')

      const second = runReservations(source, estate, maps)
      const { summary } = transformPasses(passesInput(estate, maps, second))

      expect(summary.passes).toBe(2)
      expect(rows(estate.target, 'SELECT id FROM pass_types')).toHaveLength(1)
      expect(rows(estate.target, 'SELECT id FROM pass_type_prices')).toHaveLength(2)
      expect(rows(estate.target, 'SELECT id, reference FROM passes ORDER BY id')).toEqual(before)
      expect(rows(estate.target, 'SELECT id FROM pass_admissions')).toHaveLength(2)
      expect(rows(estate.target, 'SELECT id FROM tickets')).toHaveLength(3)
    }
    finally {
      estate.target.close()
    }
  })
})
