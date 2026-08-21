import { db } from '@nuxthub/db'
import { fohContacts, venueEmergencyInfo } from '~~/server/db/schema/foh'

type SeededVenues = Array<{ id: string, name: string }>

/**
 * Emergency cards and contact numbers, so `/foh` has something to show. The
 * numbers are obviously fake: 07700 900xxx is Ofcom's drama range.
 */
export async function seedFoh(seededVenues: SeededVenues) {
  console.log('🧯 Seeding front-of-house reference data...')

  await db.insert(venueEmergencyInfo).values(seededVenues.map(venue => ({
    venueId: venue.id,
    addressForEmergencyCall: `${venue.name}, Nottingham New Theatre, University Park, Nottingham, NG7 2RD`,
    what3words: 'coach.rocks.lions',
    evacuationProcedure: 'Sound the alarm. Clear the auditorium through the nearest fire exit, then the foyer. Do not use the lift. Sweep the toilets and the dressing rooms on the way out.',
    assemblyPoint: 'The grass outside Portland Building, away from the road.',
    firstAidLocation: 'Behind the box office desk, on the wall.',
    defibrillatorLocation: 'Portland Building main entrance, inside the doors on the right.',
    isolationPoints: 'Gas: none. Electrics: the panel in the corridor behind the bar. Water: the stopcock under the kitchen sink.',
    firePanelLocation: 'Foyer, behind the door to the office. Silence, then investigate before resetting.',
  })))

  await db.insert(fohContacts).values([
    { label: 'Committee on-call', phone: '07700 900001', kind: 'COMMITTEE' as const, sort: 1, note: 'Duty committee member, all hours' },
    { label: 'Theatre Manager', phone: '07700 900002', kind: 'COMMITTEE' as const, sort: 2 },
    { label: 'Campus security', phone: '0115 951 8888', kind: 'SECURITY' as const, sort: 3, note: 'University Park, 24 hours' },
    { label: 'Portland Building reception', phone: '07700 900003', kind: 'VENUE' as const, sort: 4 },
    { label: 'Taxi (DG Cars)', phone: '0115 960 0000', kind: 'TAXI' as const, sort: 5 },
  ])

  console.log(`   ${seededVenues.length} emergency cards and 5 contacts`)
}
