// The one composer. Every door runs this, so a development database and a fixture never diverge
// in what they contain, only in where they are written (K-120).

import { seedBar } from './bar'
import { seedBookings } from './bookings'
import { seedGovernance } from './governance'
import { seedMoney } from './money'
import { seedPeople, seedPersonDetail } from './people'
import { seedProgramme } from './programme'
import { seedShowNight } from './show-night'
import { seedSpaces } from './spaces'
import { seedTraining } from './training'
import type { People, SeededPerson } from './people'
import type { SeedTarget } from './statements'

export interface SeedOptions {
  // A script cannot import nuxt-auth-utils, so the hasher is handed in and both doors use one.
  hash: (password: string) => Promise<string>
  // Generated at run time and printed once. Nothing here is ever committed (K-120 criterion 1).
  password: () => string
  token: () => string
  now?: number
}

export interface SeedResult {
  people: SeededPerson[]
  counts: Record<string, number>
  // Credentials the caller prints once and never stores.
  secrets: {
    accounts: { email: string, password: string }[]
    boardTokens: { label: string, night: string, token: string }[]
    feedTokens: { person: string, token: string }[]
  }
  // A money path this run could not post, with the reason. Empty is the expected state.
  refused: string[]
}

export async function seed(target: SeedTarget, options: SeedOptions): Promise<SeedResult> {
  const now = options.now ?? Math.floor(Date.now() / 1000)

  const people = await seedPeople(target, { hash: options.hash, password: options.password, now })
  seedPersonDetail(target, people, now)

  const spaces = await seedSpaces(target, people, { now, token: options.token })
  const training = await seedTraining(target, people, now)
  const programme = seedProgramme(target, people, now)
  const bookings = seedBookings(target, people, programme, now)
  const showNight = await seedShowNight(target, people, programme, { now, token: options.token })
  const bar = seedBar(target, people, programme, now)
  const money = await seedMoney(target, people, programme, bookings, bar, now)
  const governance = seedGovernance(target, people, now)

  return {
    people: people.order,
    counts: {
      people: people.order.length,
      rooms: spaces.counts.rooms,
      externalSpaces: spaces.counts.spaces,
      roomBookings: spaces.counts.bookings,
      externalRequests: spaces.counts.requests,
      blackouts: spaces.counts.blackouts,
      departments: training.counts.departments,
      modules: training.counts.modules,
      trainingRecords: training.counts.records,
      trainingSessions: training.counts.sessions,
      venues: programme.counts.venues,
      seasons: programme.counts.seasons,
      shows: programme.counts.shows,
      performances: programme.counts.performances,
      reservations: bookings.counts.reservations,
      tickets: bookings.counts.tickets,
      discounts: bookings.counts.discounts,
      shifts: showNight.counts.shifts,
      incidents: showNight.counts.incidents,
      ageChecks: showNight.counts.ageChecks,
      checklistStamps: showNight.counts.checklistStamps,
      barProducts: bar.counts.products,
      barVariants: bar.counts.variants,
      barItems: bar.counts.items,
      stockMovements: bar.counts.movements,
      ledgerEntries: money.entries,
      auditEntries: governance.counts.audit,
      inboxItems: governance.counts.inbox,
      notifications: governance.counts.notifications,
    },
    secrets: {
      accounts: accountsOf(people),
      boardTokens: showNight.boardTokens,
      feedTokens: spaces.feedTokens,
    },
    refused: [],
  }
}

// Only the generated ones: a persona's password is the committed development constant, which the
// caller has no need to print back (K-124).
function accountsOf(people: People): { email: string, password: string }[] {
  return people.order
    .filter((person): person is SeededPerson & { password: string } => person.password !== null && !person.persona)
    .map(person => ({ email: person.email, password: person.password }))
}
