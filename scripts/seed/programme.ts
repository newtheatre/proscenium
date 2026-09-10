// Where we perform, what we perform and when: two venues, two seasons and eight shows whose
// performances land in the past, tonight and the future, and in every status a screen shows.

import { currentShowNight, showNightBounds, showNightOf } from '../../shared/utils/show-night'
import { ensure, holds, insert, insertOnly, seedId, seedReference } from './statements'
import { personIn } from './people'
import type { People } from './people'
import type { BoundStatement, SeedTarget } from './statements'

const DAY = 86_400

// 19:30 London on the night, which is 15.5 hours after its 04:00 start whatever the clocks did
// in between (0014, E-110).
const CURTAIN_HOURS = 15.5

export const TICKET_TYPES = [
  { slug: 'standard', name: 'Standard', description: 'The full price.', price: 700, kind: 'SINGLE', accessKind: null, archived: false },
  { slug: 'concession', name: 'Concession', description: 'Students, over-65s, and anybody on benefits.', price: 500, kind: 'SINGLE', accessKind: null, archived: false },
  { slug: 'access', name: 'Access', description: 'For a patron whose access needs bring a companion.', price: 700, kind: 'SINGLE', accessKind: 'ACCESS', archived: false },
  { slug: 'companion', name: 'Companion', description: 'The companion seat, free.', price: 0, kind: 'SINGLE', accessKind: 'COMPANION', archived: false },
  { slug: 'pass', name: 'Season pass admission', description: 'A seat covered by a pass, taking no money.', price: 0, kind: 'PASS_ADMISSION', accessKind: null, archived: false },
  // Retired rather than destroyed, because it has been sold before (D-119 criterion 2).
  { slug: 'preview', name: 'Preview', description: 'The old preview price, kept for the history that names it.', price: 400, kind: 'SINGLE', accessKind: null, archived: true },
]

const CONTENT_WARNINGS = [
  { slug: 'strobe-lighting', title: 'Strobe lighting', kind: 'TECHNICAL', category: 'Lighting', sort: 0 },
  { slug: 'loud-noises', title: 'Loud noises and gunshot effects', kind: 'TECHNICAL', category: 'Sound', sort: 1 },
  { slug: 'haze', title: 'Haze and smoke effects', kind: 'TECHNICAL', category: 'Effects', sort: 2 },
  { slug: 'suicide', title: 'Suicide', kind: 'GENERAL', category: 'Themes', sort: 3 },
  { slug: 'firearms', title: 'Firearms', kind: 'GENERAL', category: 'Violence', sort: 4 },
  { slug: 'sexual-violence', title: 'Sexual violence', kind: 'GENERAL', category: 'Violence', sort: 5 },
  { slug: 'bereavement', title: 'Bereavement', kind: 'GENERAL', category: 'Themes', sort: 6 },
  { slug: 'substance-use', title: 'Alcohol and drug use', kind: 'GENERAL', category: 'Themes', sort: 7 },
]

type PerformanceWhen = number

interface SeedPerformance {
  slug: string
  // Whole show nights from tonight: negative is over, zero is tonight, positive is to come.
  nights: PerformanceWhen
  venue: 'house' | 'djanogly'
  status: 'DRAFT' | 'ON_SALE' | 'CANCELLED'
  capacityOverride?: number
  hoursAfterNightStart?: number
  externalBookingUrl?: string
  bookingClosesHoursBefore?: number
  notes?: string
}

interface SeedShow {
  slug: string
  title: string
  subtitle?: string
  description: string
  category: string
  season: 'current' | 'previous'
  status: 'DRAFT' | 'PUBLISHED'
  ageGuidance?: string
  latecomerPolicy?: 'ADMITTED' | 'AT_INTERVAL' | 'NOT_ADMITTED'
  warnings?: { slug: string, level: 'MENTIONED' | 'DISCUSSED' | 'DEPICTED' | null }[]
  confirmedNoWarnings?: true
  performances: SeedPerformance[]
}

// A season that looks like a season: something over, something on, something announced, and the
// three that are awkward (a cancelled night, a draft nobody may see, an externally ticketed run).
const SHOWS: SeedShow[] = [
  {
    slug: 'the-seagull',
    title: 'The Seagull',
    subtitle: 'Chekhov, in a new translation',
    description: 'Four acts, one lake, and nobody gets what they came for.',
    category: 'In-house',
    season: 'current',
    status: 'PUBLISHED',
    ageGuidance: 'Recommended 14 and over',
    latecomerPolicy: 'AT_INTERVAL',
    warnings: [
      { slug: 'strobe-lighting', level: null },
      { slug: 'firearms', level: 'DEPICTED' },
      { slug: 'suicide', level: 'DISCUSSED' },
    ],
    performances: [
      { slug: 'past', nights: -6, venue: 'house', status: 'ON_SALE' },
      { slug: 'yesterday', nights: -1, venue: 'house', status: 'ON_SALE' },
      { slug: 'tonight', nights: 0, venue: 'house', status: 'ON_SALE' },
      { slug: 'next-week', nights: 7, venue: 'house', status: 'ON_SALE' },
    ],
  },
  {
    slug: 'an-inspector-calls',
    title: 'An Inspector Calls',
    description: 'A comfortable dinner, and a caller who will not be shown out.',
    category: 'In-house',
    season: 'current',
    status: 'PUBLISHED',
    latecomerPolicy: 'NOT_ADMITTED',
    warnings: [{ slug: 'bereavement', level: 'DISCUSSED' }],
    performances: [
      // Six seats and six sold, so the house-full state exists without seeding a full house.
      { slug: 'soldout', nights: 0, venue: 'house', status: 'ON_SALE', capacityOverride: 6, hoursAfterNightStart: 20 },
      { slug: 'later', nights: 10, venue: 'house', status: 'ON_SALE' },
    ],
  },
  {
    slug: 'new-writing-night',
    title: 'New Writing Night',
    subtitle: 'Six short plays, none of them finished',
    description: 'The writers are in the room, which is the point and also the risk.',
    category: 'Studio',
    season: 'current',
    status: 'PUBLISHED',
    confirmedNoWarnings: true,
    performances: [
      { slug: 'tonight-studio', nights: 0, venue: 'house', status: 'ON_SALE', hoursAfterNightStart: 17, capacityOverride: 40 },
      { slug: 'fortnight', nights: 14, venue: 'house', status: 'ON_SALE', capacityOverride: 40 },
    ],
  },
  {
    slug: 'a-midsummer-nights-dream',
    title: 'A Midsummer Night\'s Dream',
    description: 'Outdoors, in Nottingham, in October. Bring a coat.',
    category: 'External hire',
    season: 'current',
    status: 'PUBLISHED',
    warnings: [{ slug: 'haze', level: null }],
    performances: [
      // Ticketed by the receiving house, so the booking button leaves our site (D-112).
      { slug: 'away', nights: 21, venue: 'djanogly', status: 'ON_SALE', externalBookingUrl: 'https://example.invalid/box-office/dream' },
    ],
  },
  {
    slug: 'the-winters-tale',
    title: 'The Winter\'s Tale',
    description: 'Half a tragedy, then sixteen years pass and a bear turns up.',
    category: 'In-house',
    season: 'current',
    status: 'PUBLISHED',
    latecomerPolicy: 'ADMITTED',
    warnings: [{ slug: 'bereavement', level: 'DEPICTED' }],
    performances: [
      // Closing early, so a cancelled night is on the schedule for a screen to explain.
      { slug: 'cancelled', nights: 3, venue: 'house', status: 'CANCELLED', notes: 'Cancelled: the get-in overran and the set is not safe.' },
      { slug: 'held', nights: 4, venue: 'house', status: 'ON_SALE', bookingClosesHoursBefore: 48 },
    ],
  },
  {
    slug: 'untitled-devised-piece',
    title: 'Untitled Devised Piece',
    description: 'Placeholder copy, because nobody has written the blurb yet.',
    category: 'Studio',
    season: 'current',
    status: 'DRAFT',
    performances: [
      // A draft performance under a draft show: visible in the console, nowhere public (D-121).
      { slug: 'unannounced', nights: 28, venue: 'house', status: 'DRAFT' },
    ],
  },
  {
    slug: 'the-crucible',
    title: 'The Crucible',
    description: 'Last season\'s closer, kept so an archive page has something in it.',
    category: 'In-house',
    season: 'previous',
    status: 'PUBLISHED',
    warnings: [
      { slug: 'sexual-violence', level: 'MENTIONED' },
      { slug: 'substance-use', level: 'MENTIONED' },
    ],
    performances: [
      { slug: 'archive-one', nights: -200, venue: 'house', status: 'ON_SALE' },
      { slug: 'archive-two', nights: -199, venue: 'house', status: 'ON_SALE' },
    ],
  },
  {
    slug: 'the-nativity-that-went-wrong',
    title: 'The Nativity That Went Wrong',
    description: 'The Christmas show, announced and not yet on sale.',
    category: 'Fringe',
    season: 'current',
    status: 'PUBLISHED',
    performances: [
      { slug: 'announced', nights: 60, venue: 'house', status: 'DRAFT' },
    ],
  },
]

export interface Programme {
  venues: Map<string, string>
  // Issued passes by slug, so the ledger can post a sale and an admission against a real one.
  passes: Map<string, string>
  shows: Map<string, string>
  ticketTypes: Map<string, string>
  // Every performance this seed wrote, so a later module can attach to a named night.
  performances: Map<string, { id: string, showId: string, venueId: string, startsAt: number, night: string, capacity: number }>
  tonight: string
  counts: { venues: number, seasons: number, shows: number, performances: number }
}

function curtainOf(night: string, hours: number): number {
  return Math.floor(showNightBounds(night).from.getTime() / 1000) + Math.round(hours * 3600)
}

export function seedProgramme(target: SeedTarget, people: People, now: number): Programme {
  const officer = personIn(people, 'rowan').id
  const tonight = currentShowNight()

  const venues = new Map<string, string>()
  venues.set('house', ensure(target, 'venues', { column: 'name', value: 'The Nottingham New Theatre' }, {
    id: seedId('venue', 'house'),
    name: 'The Nottingham New Theatre',
    address: 'Nottingham University Students Union, University Park',
    capacity: 120,
    is_external: 0,
    description: 'The house. General admission, no seat map, because we have never had one.',
    room_id: target.get<{ id: string }>('SELECT id FROM rooms WHERE name = ?', 'The Auditorium')?.id ?? null,
  }).id)

  venues.set('djanogly', ensure(target, 'venues', { column: 'name', value: 'Djanogly Theatre' }, {
    id: seedId('venue', 'djanogly'),
    name: 'Djanogly Theatre',
    address: 'Lakeside Arts, University Park',
    capacity: 200,
    is_external: 1,
    description: 'Somebody else\'s building, and somebody else\'s box office.',
    room_id: null,
  }).id)

  // The card front of house reads in the dark (E-113). Append-only, so it is written once.
  if (!holds(target, 'venue_emergency_info', { venue_id: venues.get('house')! })) {
    target.batch([insert('venue_emergency_info', {
      id: seedId('emergency', 'house'),
      venue_id: venues.get('house')!,
      assembly_point: 'The car park behind the Portland Building',
      exits: 'Two: stage left to the alley, and the foyer to Portland Hill.',
      isolation_points: 'Lighting isolation is in the box; gas is in the workshop corridor.',
      what3words: 'towns.match.press',
      notes: 'The nearest defibrillator is inside the Portland Building foyer.',
      updated_by: officer,
    })])
  }

  const seasons = new Map<string, string>()
  seasons.set('current', ensure(target, 'seasons', { column: 'name', value: '2026/27' }, {
    id: seedId('season', '2026-27'),
    name: '2026/27',
    starts_on: '2026-08-01',
    ends_on: '2027-07-31',
    sort: 0,
    archived: 0,
  }).id)
  seasons.set('previous', ensure(target, 'seasons', { column: 'name', value: '2025/26' }, {
    id: seedId('season', '2025-26'),
    name: '2025/26',
    starts_on: '2025-08-01',
    ends_on: '2026-07-31',
    sort: 1,
    archived: 1,
  }).id)

  const categories = new Map<string, string>()
  for (const [sort, name] of ['In-house', 'Studio', 'Fringe', 'External hire'].entries()) {
    categories.set(name, ensure(target, 'show_categories', { column: 'name', value: name }, {
      id: seedId('category', name),
      name,
      sort,
    }).id)
  }

  const ticketTypes = new Map<string, string>()
  for (const type of TICKET_TYPES) {
    ticketTypes.set(type.slug, ensure(target, 'ticket_types', { column: 'name', value: type.name }, {
      id: seedId('tickettype', type.slug),
      name: type.name,
      description: type.description,
      price: type.price,
      kind: type.kind,
      access_kind: type.accessKind,
      archived: type.archived ? 1 : 0,
    }).id)
  }

  const warnings = new Map<string, string>()
  for (const warning of CONTENT_WARNINGS) {
    warnings.set(warning.slug, ensure(target, 'content_warnings', { column: 'slug', value: warning.slug }, {
      id: seedId('warning', warning.slug),
      slug: warning.slug,
      title: warning.title,
      kind: warning.kind,
      category: warning.category,
      sort: warning.sort,
    }).id)
  }

  const shows = new Map<string, string>()
  const performances: Programme['performances'] = new Map()
  const statements: BoundStatement[] = []
  let performanceCount = 0

  for (const show of SHOWS) {
    const showId = ensure(target, 'shows', { column: 'slug', value: show.slug }, {
      id: seedId('show', show.slug),
      slug: show.slug,
      title: show.title,
      subtitle: show.subtitle ?? null,
      description: show.description,
      category_id: categories.get(show.category)!,
      season_id: seasons.get(show.season)!,
      age_guidance: show.ageGuidance ?? null,
      latecomer_policy: show.latecomerPolicy ?? null,
      warnings_confirmed_none: show.confirmedNoWarnings ? 1 : 0,
      status: show.status,
    }).id
    shows.set(show.slug, showId)

    for (const warning of show.warnings ?? []) {
      statements.push(insert('show_content_warnings', {
        id: seedId('showwarning', show.slug, warning.slug),
        show_id: showId,
        warning_id: warnings.get(warning.slug)!,
        level: warning.level,
      }))
    }

    for (const planned of show.performances) {
      const night = planned.nights === 0 ? tonight : showNightOf(new Date((now + planned.nights * DAY) * 1000))
      const venueId = venues.get(planned.venue)!
      let startsAt = curtainOf(night, planned.hoursAfterNightStart ?? CURTAIN_HOURS)

      // Seeding after curtain would leave tonight with nothing sellable, so tonight's moves
      // forward, staying inside the night it belongs to.
      if (planned.nights === 0) {
        const lastMoment = Math.floor(showNightBounds(night).to.getTime() / 1000) - 1
        startsAt = Math.min(Math.max(startsAt, now + 2 * 3600), lastMoment)
      }

      const id = seedId('performance', show.slug, planned.slug)
      statements.push(insert('performances', {
        id,
        show_id: showId,
        venue_id: venueId,
        starts_at: startsAt,
        doors_at: startsAt - 1800,
        duration_minutes: 150,
        interval_count: 1,
        interval_minutes: 15,
        capacity_override: planned.capacityOverride ?? null,
        booking_closes_hours_before: planned.bookingClosesHoursBefore ?? null,
        external_booking_url: planned.externalBookingUrl ?? null,
        status: planned.status,
        notes: planned.notes ?? null,
      }))

      // Tonight has to stay tonight even on a re-run, so an existing row moves rather than a
      // second one appearing beside it.
      if (planned.nights === 0) {
        statements.push(['UPDATE performances SET starts_at = ?, doors_at = ? WHERE id = ?', startsAt, startsAt - 1800, id])
      }

      performances.set(`${show.slug}/${planned.slug}`, {
        id,
        showId,
        venueId,
        startsAt,
        night,
        capacity: planned.capacityOverride ?? (planned.venue === 'house' ? 120 : 200),
      })
      performanceCount++
    }
  }

  // One override apiece, so both levels of the price resolution have a row to resolve through
  // rather than only the base (D-120).
  statements.push(insert('show_ticket_overrides', {
    id: seedId('showprice', 'new-writing-night', 'standard'),
    show_id: shows.get('new-writing-night')!,
    ticket_type_id: ticketTypes.get('standard')!,
    price: 300,
    active: 1,
  }))

  statements.push(insert('performance_ticket_overrides', {
    id: seedId('performanceprice', 'the-seagull', 'tonight'),
    performance_id: performances.get('the-seagull/tonight')!.id,
    ticket_type_id: ticketTypes.get('concession')!,
    price: 400,
    active: 1,
  }))

  target.batch(statements)

  const passes = seedPasses(target, people, shows, now)

  return {
    passes,
    venues,
    shows,
    ticketTypes,
    performances,
    tonight,
    counts: { venues: venues.size, seasons: seasons.size, shows: SHOWS.length, performances: performanceCount },
  }
}

// A pass on sale, one closed and one still a draft, so the pass screens are never empty (D-124).
function seedPasses(target: SeedTarget, people: People, shows: Map<string, string>, now: number): Map<string, string> {
  const passes: { slug: string, name: string, status: string, from: number, until: number, max: number | null, prices: [string, number][], shows: string[] }[] = [
    {
      slug: 'season-2026-27',
      name: 'Season pass 2026/27',
      status: 'ON_SALE',
      from: now - 30 * DAY,
      until: now + 300 * DAY,
      max: 60,
      prices: [['Standard', 3500], ['Concession', 2500]],
      shows: ['the-seagull', 'an-inspector-calls', 'the-winters-tale', 'new-writing-night'],
    },
    {
      slug: 'season-2025-26',
      name: 'Season pass 2025/26',
      status: 'CLOSED',
      from: now - 400 * DAY,
      until: now - 40 * DAY,
      max: 60,
      prices: [['Standard', 3200]],
      shows: ['the-crucible'],
    },
    {
      slug: 'christmas-2026',
      name: 'Christmas double bill',
      status: 'DRAFT',
      from: now + 80 * DAY,
      until: now + 120 * DAY,
      max: null,
      prices: [['Standard', 1200]],
      shows: ['the-nativity-that-went-wrong'],
    },
  ]

  const statements: BoundStatement[] = []
  for (const pass of passes) {
    const id = seedId('pass', pass.slug)
    statements.push(insert('pass_types', {
      id,
      slug: pass.slug,
      name: pass.name,
      description: 'Seeded so the pass screens have something to show.',
      status: pass.status,
      valid_from: pass.from,
      valid_until: pass.until,
      sales_open_at: pass.status === 'DRAFT' ? null : pass.from,
      sales_close_at: pass.status === 'DRAFT' ? null : pass.until,
      max_issued: pass.max,
    }))
    for (const [label, price] of pass.prices) {
      statements.push(insert('pass_type_prices', { id: seedId('passprice', pass.slug, label), pass_type_id: id, label, price }))
    }
    for (const slug of pass.shows) {
      statements.push(insert('pass_type_shows', {
        id: seedId('passshow', pass.slug, slug),
        pass_type_id: id,
        show_id: shows.get(slug)!,
      }))
    }
  }
  target.batch(statements)

  return issuePasses(target, people, now)
}

// Passes actually held by somebody, in every status, plus the requests behind them and one
// admission already taken. `pass_admissions` is append-only, so a re-run asks before it writes.
function issuePasses(target: SeedTarget, people: People, now: number): Map<string, string> {
  const desk = personIn(people, 'rowan').id
  const issued = new Map<string, string>()
  const statements: BoundStatement[] = []

  const held: { slug: string, holder: string, status: string, label: string, price: number }[] = [
    { slug: 'rowan', holder: 'rowan', status: 'ACTIVE', label: 'Standard', price: 3500 },
    { slug: 'devon', holder: 'devon', status: 'ACTIVE', label: 'Concession', price: 2500 },
    { slug: 'sam', holder: 'sam', status: 'CANCELLED', label: 'Standard', price: 3500 },
    { slug: 'iris', holder: 'iris', status: 'EXPIRED', label: 'Standard', price: 3200 },
  ]

  for (const pass of held) {
    const id = seedId('passheld', pass.slug)
    issued.set(pass.slug, id)
    statements.push(insert('passes', {
      id,
      reference: seedReference(`pass-${pass.slug}`),
      pass_type_id: seedId('pass', pass.status === 'EXPIRED' ? 'season-2025-26' : 'season-2026-27'),
      pass_type_price_id: seedId('passprice', pass.status === 'EXPIRED' ? 'season-2025-26' : 'season-2026-27', pass.label),
      user_id: personIn(people, pass.holder).id,
      price_paid: pass.price,
      status: pass.status,
      issued_by: desk,
      notes: pass.status === 'CANCELLED' ? 'Cancelled and refunded: bought in error.' : null,
      created_at: now - 20 * DAY,
      updated_at: now - 20 * DAY,
    }))
  }

  const requests: { slug: string, holder: string, status: string, note: string }[] = [
    { slug: 'fulfilled', holder: 'rowan', status: 'FULFILLED', note: 'Paying at the desk on Thursday.' },
    { slug: 'pending', holder: 'mira', status: 'PENDING', note: 'Can I pay in two halves?' },
    { slug: 'declined', holder: 'lapsed', status: 'DECLINED', note: 'Would like a pass for the season.' },
    { slug: 'expired', holder: 'kavya', status: 'EXPIRED', note: 'Asked before the sales window closed.' },
  ]
  for (const request of requests) {
    const decided = request.status !== 'PENDING'
    statements.push(insert('pass_requests', {
      id: seedId('passrequest', request.slug),
      pass_type_id: seedId('pass', 'season-2026-27'),
      user_id: personIn(people, request.holder).id,
      status: request.status,
      note: request.note,
      decided_by: decided ? desk : null,
      pass_id: request.status === 'FULFILLED' ? issued.get('rowan')! : null,
      created_at: now - 25 * DAY,
      decided_at: decided ? now - 20 * DAY : null,
    }))
  }

  target.batch(statements)
  return issued
}

// The seat a pass covered on a night that is over, which is what the append-only admission
// register holds. Separate because the ticket it names is written after the programme is.
export function seedPassAdmissions(target: SeedTarget, people: People, programme: Programme, now: number): void {
  const id = seedId('passadmission', 'past')
  const ticketId = seedId('ticket', 'past-attended', 0)
  if (holds(target, 'pass_admissions', { id }) || !holds(target, 'tickets', { id: ticketId })) return

  target.batch([insertOnly('pass_admissions', {
    id,
    pass_id: programme.passes.get('rowan')!,
    performance_id: programme.performances.get('the-seagull/past')!.id,
    ticket_id: ticketId,
    admitted_at: now - 6 * DAY,
    admitted_by: personIn(people, 'rowan').id,
  })])
}
