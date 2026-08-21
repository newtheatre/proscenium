import { db } from '@nuxthub/db'
import { performances } from '~~/server/db/schema/show'
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

  // One performance tonight, so `/foh` shows a real show night rather than an
  // empty state. 19:30 local, which is 18:30Z through the British summer.
  const template = seededPerformances[0]
  let tonight: string | null = null
  if (template) {
    const startsAt = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 18, 30,
    ))
    const [row] = await db.insert(performances).values({
      showId: template.showId,
      venueId: template.venueId,
      startsAt,
      doorsAt: new Date(startsAt.getTime() - 30 * 60 * 1000),
      status: 'ON_SALE',
    }).returning()
    tonight = row?.id ?? null
  }

  const upcoming = seededPerformances
    .filter(p => p.startsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 4)

  const staff = seededUsers.filter(u => !u.email.includes('.invalid'))

  interface SeededShift {
    performanceId: string
    role: 'DUTY_MANAGER' | 'DOOR' | 'BAR'
    userId?: string | null
    status: 'OPEN' | 'CONFIRMED'
    confirmedAt?: string | null
  }

  const rows: SeededShift[] = upcoming.flatMap((performance, index) => {
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

  // Tonight gets the dev front-of-house user on the door and a duty manager,
  // so both the rostered and the box-office views of /foh can be seen.
  if (tonight) {
    rows.push(
      {
        performanceId: tonight,
        role: 'DUTY_MANAGER' as const,
        userId: staff[0]?.id ?? null,
        status: staff[0] ? ('CONFIRMED' as const) : ('OPEN' as const),
        confirmedAt: staff[0] ? now.toISOString() : null,
      },
      {
        performanceId: tonight,
        role: 'DOOR' as const,
        userId: 'dev-front-of-house',
        status: 'CONFIRMED' as const,
        confirmedAt: now.toISOString(),
      },
      { performanceId: tonight, role: 'BAR' as const, status: 'OPEN' as const },
    )
  }

  if (rows.length) await db.insert(performanceShifts).values(rows)

  console.log(`   ${upcoming.length} performances staffed, one deliberately without a duty manager`)
  if (tonight) console.log('   plus one tonight, with dev-front-of-house on the door')
}
