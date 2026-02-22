import { users, reservations, tickets } from 'hub:db:schema'
import type { seedUsers } from './users'
import type { seedShows } from './shows'
import type { seedTicketTypes } from './ticketTypes'

type SeededUsers = Awaited<ReturnType<typeof seedUsers>>
type SeededShows = Awaited<ReturnType<typeof seedShows>>['seededShows']
type SeededPerformances = Awaited<ReturnType<typeof seedShows>>['seededPerformances']
type SeededTicketTypes = Awaited<ReturnType<typeof seedTicketTypes>>

/**
 * Seed Reservations
 *
 * Creates a realistic spread of reservations against past and upcoming shows.
 * Includes reservations from full account holders and shadow (guest) accounts.
 * Covers all status values: PENDING, COLLECTED, DOOR, CANCELLED, NO_SHOW.
 */
export async function seedReservations(
  seededUsers: SeededUsers,
  seededShows: SeededShows,
  seededPerformances: SeededPerformances,
  createdTicketTypes: SeededTicketTypes,
) {
  console.log('🎟️  Seeding reservations...')

  // Resolve shows by slug
  const earnest = seededShows.find(s => s.slug === 'importance-of-being-earnest')!
  const hamlet = seededShows.find(s => s.slug === 'hamlet')!

  // Performances per show (ordered as inserted: ascending startsAt)
  const earnestPerfs = seededPerformances.filter(p => p.showId === earnest.id)
  const hamletPerfs = seededPerformances.filter(p => p.showId === hamlet.id)

  // Actual-account users to attach reservations to
  const regularUser = seededUsers.find(u => u.email === 'user@newtheatre.org.uk')!
  const unverifiedUser = seededUsers.find(u => u.email === 'unverified@newtheatre.org.uk')!

  // Ticket types
  const adult = createdTicketTypes.find(t => t.name === 'Adult')!
  const student = createdTicketTypes.find(t => t.name === 'Student/Concession')!
  const member = createdTicketTypes.find(t => t.name === 'Member')!
  const complimentary = createdTicketTypes.find(t => t.name === 'Complimentary')!

  // ── Shadow / guest accounts ───────────────────────────────────────────────

  const shadowUsersToCreate = [
    { email: 'alice.johnson@example.com', name: 'Alice Johnson', password: null, verified: false },
    { email: 'bob.smith@example.com', name: 'Bob Smith', password: null, verified: false },
    { email: 'carol.white@example.com', name: 'Carol White', password: null, verified: false },
  ]
  const shadowUsers = await db.insert(users).values(shadowUsersToCreate).returning()
  const [alice, bob, carol] = shadowUsers
  console.log(`  ✅ Created ${shadowUsers.length} shadow (guest) accounts`)

  // ── Reservations ──────────────────────────────────────────────────────────
  // Each entry: { reservation fields, tickets: { ticketTypeId, quantity }[] }

  type ReservationSeed = typeof reservations.$inferInsert & {
    ticketRows: { ticketTypeId: string, pricePaid: number }[]
  }

  // Earnest — past run, mix of outcomes
  const reservationSeeds: ReservationSeed[] = [
    // Collected: regular user booked 2 adults for the first completed night
    {
      performanceId: earnestPerfs[1]!.id, // day(-34)
      userId: regularUser.id,
      status: 'COLLECTED',
      customerNotes: 'Could we have aisle seats if possible?',
      ticketRows: [
        { ticketTypeId: adult.id, pricePaid: adult.price },
        { ticketTypeId: adult.id, pricePaid: adult.price },
      ],
    },
    // Collected: shadow user (Alice) booked adult + student
    {
      performanceId: earnestPerfs[1]!.id, // day(-34) same performance
      userId: alice!.id,
      status: 'COLLECTED',
      ticketRows: [
        { ticketTypeId: adult.id, pricePaid: adult.price },
        { ticketTypeId: student.id, pricePaid: student.price },
      ],
    },
    // No-show: unverified user booked but didn't collect
    {
      performanceId: earnestPerfs[2]!.id, // day(-33)
      userId: unverifiedUser.id,
      status: 'NO_SHOW',
      ticketRows: [
        { ticketTypeId: adult.id, pricePaid: adult.price },
      ],
    },
    // Collected: complimentary for production team
    {
      performanceId: earnestPerfs[3]!.id, // day(-32 matinée)
      userId: regularUser.id,
      status: 'COLLECTED',
      staffNotes: 'Production team comps — director and stage manager',
      ticketRows: [
        { ticketTypeId: complimentary.id, pricePaid: complimentary.price },
        { ticketTypeId: complimentary.id, pricePaid: complimentary.price },
      ],
    },
    // Cancelled by customer: shadow user Bob cancelled before the show
    {
      performanceId: earnestPerfs[4]!.id, // day(-32 evening)
      userId: bob!.id,
      status: 'CANCELLED',
      cancelledBy: 'CUSTOMER' as const,
      ticketRows: [
        { ticketTypeId: adult.id, pricePaid: adult.price },
        { ticketTypeId: adult.id, pricePaid: adult.price },
      ],
    },

    // Hamlet — currently running, mix of pending and collected
    // Pending: regular user booked for an upcoming performance
    {
      performanceId: hamletPerfs[1]!.id, // day(+1) — tomorrow
      userId: regularUser.id,
      status: 'PENDING',
      customerNotes: 'Wheelchair user — please reserve accessible seating.',
      ticketRows: [
        { ticketTypeId: adult.id, pricePaid: adult.price },
        { ticketTypeId: student.id, pricePaid: student.price },
      ],
    },
    // Pending: shadow user Carol booked for the upcoming matinée
    {
      performanceId: hamletPerfs[3]!.id, // day(+3 matinée)
      userId: carol!.id,
      status: 'PENDING',
      ticketRows: [
        { ticketTypeId: member.id, pricePaid: member.price },
      ],
    },
    // Door: walk-up booking for yesterday's past Hamlet performance
    {
      performanceId: hamletPerfs[0]!.id, // day(-1)
      userId: alice!.id,
      status: 'DOOR',
      staffNotes: 'Walk-up — paid on door',
      ticketRows: [
        { ticketTypeId: adult.id, pricePaid: adult.price },
        { ticketTypeId: adult.id, pricePaid: adult.price },
      ],
    },
    // Collected: yesterday's performance — unverified user collected
    {
      performanceId: hamletPerfs[0]!.id, // day(-1)
      userId: unverifiedUser.id,
      status: 'COLLECTED',
      ticketRows: [
        { ticketTypeId: student.id, pricePaid: student.price },
      ],
    },
    // Cancelled by staff
    {
      performanceId: hamletPerfs[2]!.id, // day(+2)
      userId: bob!.id,
      status: 'CANCELLED',
      cancelledBy: 'STAFF' as const,
      staffNotes: 'Duplicate booking — cancelled by box office',
      ticketRows: [
        { ticketTypeId: adult.id, pricePaid: adult.price },
      ],
    },
  ]

  // Insert all reservations and their tickets
  let createdCount = 0
  let ticketCount = 0
  for (const { ticketRows, ...reservationData } of reservationSeeds) {
    const [reservation] = await db.insert(reservations).values(reservationData).returning()
    if (!reservation) continue

    if (ticketRows.length > 0) {
      await db.insert(tickets).values(
        ticketRows.map(t => ({
          reservationId: reservation.id,
          performanceId: reservationData.performanceId,
          ticketTypeId: t.ticketTypeId,
          pricePaid: t.pricePaid,
        })),
      )
      ticketCount += ticketRows.length
    }
    createdCount++
  }

  console.log(`  ✅ Created ${createdCount} reservations with ${ticketCount} tickets`)
}
