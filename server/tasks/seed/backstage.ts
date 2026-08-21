import { db } from '@nuxthub/db'
import { backstagePresets } from '~~/server/db/schema/backstageBoard'

/**
 * A starting set of calls. Admin data, because each society runs them slightly
 * differently — agree these with a stage manager before treating them as fixed.
 */
export async function seedBackstagePresets() {
  console.log('📻 Seeding backstage calls...')

  await db.insert(backstagePresets).values([
    { direction: 'FOH' as const, label: 'Clearance given', milestone: 'CLEARANCE' as const, sort: 1 },
    { direction: 'FOH' as const, label: 'House open', milestone: 'HOUSE_OPEN' as const, sort: 2 },
    { direction: 'FOH' as const, label: 'Show start', milestone: 'SHOW_START' as const, sort: 3 },
    { direction: 'FOH' as const, label: 'Hold the house', sort: 4 },
    { direction: 'FOH' as const, label: 'Interval', milestone: 'INTERVAL' as const, sort: 5 },
    { direction: 'FOH' as const, label: 'Interval ending', milestone: 'RESTART' as const, sort: 6 },
    { direction: 'FOH' as const, label: 'Show ended', milestone: 'END' as const, sort: 7 },

    { direction: 'BACKSTAGE' as const, label: 'Cleared for house open', sort: 1 },
    { direction: 'BACKSTAGE' as const, label: 'Standby', sort: 2 },
    { direction: 'BACKSTAGE' as const, label: 'We need five more minutes', sort: 3 },
    { direction: 'BACKSTAGE' as const, label: 'Ready', sort: 4 },
  ])

  console.log('   7 front-of-house calls, 4 from backstage')
}
