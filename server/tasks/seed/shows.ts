import { db } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { shows, performances } from '~~/server/db/schema/show'
import { showTicketTypeOverrides, ticketTypes as ticketTypesTable } from '~~/server/db/schema/ticket'
import { contentWarnings, showContentWarnings } from '~~/server/db/schema/contentWarnings'

type SeededVenues = Array<{ id: string, name: string, capacity: number | null }>
type TicketType = { id: string, name: string, price: number, activeByDefault: boolean }

export default defineTask({
  meta: {
    name: 'db:seed:shows',
    description: 'Seed database with sample shows and performances',
  },
  async run() {
    const allVenues = await db.query.venues.findMany()
    const { seededShows, seededPerformances } = await seedShows(allVenues)
    printShowsSummary(seededShows, seededPerformances)
    return { result: 'Shows seeded successfully' }
  },
})

/**
 * Shows across all three lifecycle stages, so the admin tabs and the public
 * listings both have something to render.
 */
export async function seedShows(venues: SeededVenues, ticketTypes?: TicketType[]) {
  console.log('🎭 Seeding shows and performances...')

  const newTheatre = venues.find(v => v.name === 'New Theatre')
  const lakeside = venues.find(v => v.name === 'Lakeside Arts Theatre')
  const djanogly = venues.find(v => v.name === 'Djanogly Theatre')

  if (!newTheatre || !lakeside || !djanogly) {
    throw new Error('Required venues not found — run venue seed first')
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  // Returns a Date at the given hour:minute UTC, offset by `days` from today.
  // day(0) = today, day(-1) = yesterday, day(7) = one week from now.
  function day(offset: number, hour = 19, minute = 30): Date {
    const d = new Date()
    d.setUTCHours(hour, minute, 0, 0)
    d.setUTCDate(d.getUTCDate() + offset)
    return d
  }

  function doors(showtime: Date, minutesBefore = 30): Date {
    return new Date(showtime.getTime() - minutesBefore * 60_000)
  }

  // ── Shows ─────────────────────────────────────────────────────────────────

  const showsToCreate = [
    {
      slug: 'importance-of-being-earnest',
      title: 'The Importance of Being Earnest',
      subtitle: 'A Trivial Comedy for Serious People',
      description: 'Oscar Wilde\'s masterpiece of wit and wordplay. Two friends maintain fictitious alter egos to escape their social obligations, with mistaken identities and romantic entanglements following inevitably.',
      ageGuidance: 'Suitable for all ages',
      latecomerPolicy: 'INTERVAL_ONLY' as const,
      status: 'PUBLISHED' as const,
    },
    {
      slug: 'hamlet',
      title: 'Hamlet',
      subtitle: null,
      ageGuidance: '14+, for themes of grief and violence',
      latecomerPolicy: 'SUITABLE_BREAK' as const,
      description: 'Shakespeare\'s most celebrated tragedy. The Prince of Denmark wrestles with grief, betrayal, and the burden of revenge in this timeless examination of mortality and moral corruption.',
      status: 'PUBLISHED' as const,
    },
    {
      slug: 'into-the-woods',
      title: 'Into the Woods',
      subtitle: null,
      description: 'Sondheim and Lapine\'s beloved musical interweaves classic fairy tales to explore the consequences of wishes — and what happens after "happily ever after".',
      status: 'DRAFT' as const,
    },
    {
      slug: 'oscars',
      title: 'Oscar Night',
      subtitle: 'The 98th Academy Awards',
      description: 'Join us for a free screening of the Academy Awards ceremony. Grab a seat, enjoy the show, and see who takes home the gold.',
      status: 'PUBLISHED' as const,
    },
  ]

  const seededShows = await db.insert(shows).values(showsToCreate).returning()
  console.log(`  ✅ Created ${seededShows.length} shows`)

  const earnest = seededShows.find(s => s.slug === 'importance-of-being-earnest')!
  const hamlet = seededShows.find(s => s.slug === 'hamlet')!
  const intoTheWoods = seededShows.find(s => s.slug === 'into-the-woods')!
  const oscars = seededShows.find(s => s.slug === 'oscars')!

  // ── Performances ──────────────────────────────────────────────────────────

  // Offsets are relative to today, so the past/current/future spread is the same
  // whenever the seed runs.

  const performancesToCreate = [
    // The Importance of Being Earnest — completed run at New Theatre
    {
      showId: earnest.id,
      venueId: newTheatre.id,
      startsAt: day(-35),
      doorsAt: doors(day(-35)),
      durationMinutes: 120,
      intervalCount: 1,
      status: 'CANCELLED' as const, // Preview night was cancelled
    },
    {
      showId: earnest.id,
      venueId: newTheatre.id,
      startsAt: day(-34),
      doorsAt: doors(day(-34)),
      durationMinutes: 120,
      intervalCount: 1,
      status: 'ON_SALE' as const, // Past + ON_SALE → inferred COMPLETED at query time
    },
    {
      showId: earnest.id,
      venueId: newTheatre.id,
      startsAt: day(-33),
      doorsAt: doors(day(-33)),
      durationMinutes: 120,
      intervalCount: 1,
      status: 'ON_SALE' as const,
    },
    {
      showId: earnest.id,
      venueId: newTheatre.id,
      startsAt: day(-32, 14, 30), // Matinée
      doorsAt: doors(day(-32, 14, 30)),
      durationMinutes: 120,
      intervalCount: 1,
      status: 'ON_SALE' as const,
    },
    {
      showId: earnest.id,
      venueId: newTheatre.id,
      startsAt: day(-32), // Same-day evening
      doorsAt: doors(day(-32)),
      durationMinutes: 120,
      intervalCount: 1,
      status: 'ON_SALE' as const,
    },

    // Hamlet — currently running at New Theatre
    {
      showId: hamlet.id,
      venueId: newTheatre.id,
      startsAt: day(-1),
      doorsAt: doors(day(-1)),
      durationMinutes: 180,
      intervalCount: 1,
      status: 'ON_SALE' as const, // Past + ON_SALE → inferred COMPLETED at query time
    },
    {
      showId: hamlet.id,
      venueId: newTheatre.id,
      startsAt: day(1),
      doorsAt: doors(day(1)),
      durationMinutes: 180,
      intervalCount: 1,
      status: 'ON_SALE' as const,
    },
    {
      showId: hamlet.id,
      venueId: newTheatre.id,
      startsAt: day(2),
      doorsAt: doors(day(2)),
      durationMinutes: 180,
      intervalCount: 1,
      status: 'ON_SALE' as const,
    },
    {
      showId: hamlet.id,
      venueId: newTheatre.id,
      startsAt: day(3, 14, 30), // Matinée
      doorsAt: doors(day(3, 14, 30)),
      durationMinutes: 180,
      intervalCount: 1,
      status: 'ON_SALE' as const,
    },
    {
      showId: hamlet.id,
      venueId: newTheatre.id,
      startsAt: day(3), // Same-day evening
      doorsAt: doors(day(3)),
      durationMinutes: 180,
      intervalCount: 1,
      status: 'ON_SALE' as const,
    },
    {
      showId: hamlet.id,
      venueId: djanogly.id, // Transfer performance at larger venue
      startsAt: day(9),
      doorsAt: doors(day(9)),
      durationMinutes: 180,
      intervalCount: 1,
      capacityOverride: 120, // Restricted staging capacity
      status: 'ON_SALE' as const,
    },

    // Oscar Night — free one-off event at New Theatre, one week from seeding date
    {
      showId: oscars.id,
      venueId: newTheatre.id,
      startsAt: day(7),
      doorsAt: doors(day(7)),
      durationMinutes: 210,
      intervalCount: 0,
      status: 'ON_SALE' as const,
    },

    // Into the Woods — upcoming draft at Lakeside Arts
    {
      showId: intoTheWoods.id,
      venueId: lakeside.id,
      startsAt: day(49),
      doorsAt: doors(day(49)),
      durationMinutes: 150,
      intervalCount: 1,
      status: 'DRAFT' as const,
    },
    {
      showId: intoTheWoods.id,
      venueId: lakeside.id,
      startsAt: day(50),
      doorsAt: doors(day(50)),
      durationMinutes: 150,
      intervalCount: 1,
      status: 'DRAFT' as const,
    },
    {
      showId: intoTheWoods.id,
      venueId: lakeside.id,
      startsAt: day(51),
      doorsAt: doors(day(51)),
      durationMinutes: 150,
      intervalCount: 1,
      status: 'DRAFT' as const,
    },
    {
      showId: intoTheWoods.id,
      venueId: lakeside.id,
      startsAt: day(52, 14, 30), // Matinée
      doorsAt: doors(day(52, 14, 30)),
      durationMinutes: 150,
      intervalCount: 1,
      status: 'DRAFT' as const,
    },
    {
      showId: intoTheWoods.id,
      venueId: lakeside.id,
      startsAt: day(52), // Same-day evening
      doorsAt: doors(day(52)),
      durationMinutes: 150,
      intervalCount: 1,
      status: 'DRAFT' as const,
    },
  ]

  const seededPerformances = await db.insert(performances).values(performancesToCreate).returning()
  console.log(`  ✅ Created ${seededPerformances.length} performances`)

  // ── Ticket Type Overrides ─────────────────────────────────────────────────
  // Oscar Night is a free event — disable all paid ticket types and enable Complimentary.
  const resolvedTicketTypes = ticketTypes ?? await db.select().from(ticketTypesTable)
  const overridesToCreate = resolvedTicketTypes
    .filter(tt => tt.price > 0 || tt.name === 'Complimentary')
    .map(tt => ({
      showId: oscars.id,
      ticketTypeId: tt.id,
      price: tt.price, // keep existing price (paid types remain priced but inactive)
      active: tt.name === 'Complimentary' ? true : false,
    }))

  if (overridesToCreate.length > 0) {
    await db.insert(showTicketTypeOverrides).values(overridesToCreate)
    console.log(`  ✅ Created ${overridesToCreate.length} ticket type overrides for Oscar Night (free event)`)
  }

  // Enough to exercise all three public warning states, which is the whole
  // design (ADR-0004). Looked up by slug, as the application does.
  const vocabulary = await db.select({ id: contentWarnings.id, slug: contentWarnings.slug })
    .from(contentWarnings)
  const warningId = (slug: string) => vocabulary.find(w => w.slug === slug)?.id

  const hamletWarnings = [
    { slug: 'sudden-noise', level: null },
    { slug: 'naked-flame', level: null },
    { slug: 'murder', level: 'DEPICTED' as const },
    { slug: 'suicide', level: 'DISCUSSED' as const },
    { slug: 'grief', level: 'DEPICTED' as const },
    { slug: 'mental-illness', level: 'DISCUSSED' as const },
    { slug: 'incest', level: 'MENTIONED' as const },
    { slug: 'violence', level: 'DEPICTED' as const },
  ]
    .map(w => ({ showId: hamlet.id, contentWarningId: warningId(w.slug), level: w.level }))
    .filter((w): w is { showId: string, contentWarningId: string, level: typeof w.level } => !!w.contentWarningId)

  if (hamletWarnings.length > 0) {
    await db.insert(showContentWarnings).values(hamletWarnings)
    await db.update(shows)
      .set({ contentWarningNotes: 'The graveyard scene includes an open grave and handled remains. Ophelia\'s drowning is described but not staged.' })
      .where(eq(shows.id, hamlet.id))
    console.log(`  ✅ Created ${hamletWarnings.length} content warnings for Hamlet`)
  }
  else {
    console.log('  ⚠️  No content warning vocabulary found — run migrations first')
  }

  await db.update(shows).set({ warningsConfirmedNone: true }).where(eq(shows.id, earnest.id))
  console.log('  ✅ Marked The Importance of Being Earnest as confirmed-no-warnings')

  return { seededShows, seededPerformances }
}

export function printShowsSummary(
  seededShows: Awaited<ReturnType<typeof seedShows>>['seededShows'],
  seededPerformances: Awaited<ReturnType<typeof seedShows>>['seededPerformances'],
) {
  console.log('\n🎭 Shows:')
  for (const show of seededShows) {
    const count = seededPerformances.filter(p => p.showId === show.id).length
    console.log(`  • [${show.status}] ${show.title} — ${count} performance${count !== 1 ? 's' : ''}`)
  }
}
