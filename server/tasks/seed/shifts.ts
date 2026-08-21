import { db } from '@nuxthub/db'
import { performanceShifts, shiftTemplates } from '~~/server/db/schema/shifts'
import type { seedUsers } from './users'
import type { seedShows } from './shows'

type SeededUsers = Awaited<ReturnType<typeof seedUsers>>
type SeededPerformances = Awaited<ReturnType<typeof seedShows>>['seededPerformances']

/**
 * The estate default template, plus a staffed rota on the next few
 * performances so the admin screen and its warning have something to show.
 */
export async function seedShifts(seededUsers: SeededUsers, seededPerformances: SeededPerformances) {
  console.log('🗓️  Seeding the rota...')

  // Null venue: the fallback used when a venue has no template rows of its own.
  await db.insert(shiftTemplates).values([
    { venueId: null, role: 'DUTY_MANAGER', count: 1 },
    { venueId: null, role: 'DOOR', count: 2 },
    { venueId: null, role: 'BAR', count: 1 },
  ])

  const now = new Date()
  const upcoming = seededPerformances
    .filter(p => p.startsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 4)

  const staff = seededUsers.filter(u => !u.email.includes('.invalid'))
  const rows = upcoming.flatMap((performance, index) => {
    const dm = staff[index % staff.length]
    // The last one is left without a duty manager on purpose, so the admin
    // screen's seven-day warning is visible in development.
    const withDutyManager = index < upcoming.length - 1

    return [
      {
        performanceId: performance.id,
        role: 'DUTY_MANAGER' as const,
        userId: withDutyManager ? dm?.id ?? null : null,
        status: withDutyManager && dm ? ('CONFIRMED' as const) : ('OPEN' as const),
        confirmedAt: withDutyManager && dm ? now.toISOString() : null,
      },
      { performanceId: performance.id, role: 'DOOR' as const, status: 'OPEN' as const },
      { performanceId: performance.id, role: 'DOOR' as const, status: 'OPEN' as const },
      { performanceId: performance.id, role: 'BAR' as const, status: 'OPEN' as const },
    ]
  })

  if (rows.length) await db.insert(performanceShifts).values(rows)

  console.log(`   ${upcoming.length} performances staffed, one deliberately without a duty manager`)
}
