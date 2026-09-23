import { describe, expect, test } from 'bun:test'
import { render, TEMPLATE_NAMES } from '#server/utils/templates'
import { saysStatus } from '#shared/utils/approvals'
import { saysBookingState } from '#shared/utils/bookings'
import { ROLES, saysRole } from '#shared/utils/roles'
import { ordinal } from '#shared/utils/text'
import type { TemplateContext } from '#server/utils/templates'

// K-128 criterion 2: the copy guide applied to every template and shared label. The sweep is
// pinned here so a reintroduced house word, enum word or stray call to action fails CI.

const ROOMS_URL = 'https://newtheatre.org.uk/rooms/mine'

// A part is wrapped for the plain-text reader, so a sentence is matched without its line breaks.
const flat = (part: string): string => part.replace(/\s+/g, ' ')

// One context wide enough for every template: a template reads only the keys it needs, and
// `render` refuses any part that came out holding `undefined`.
const EVERYTHING: TemplateContext = {
  name: 'Ada',
  url: 'https://newtheatre.org.uk/reset/abc',
  signInUrl: 'https://newtheatre.org.uk/sign-in',
  securityUrl: 'https://newtheatre.org.uk/account/access',
  accountUrl: 'https://newtheatre.org.uk/account',
  membershipUrl: 'https://newtheatre.org.uk/account/membership',
  roomsUrl: ROOMS_URL,
  queueUrl: 'https://newtheatre.org.uk/admin/requests',
  safetyUrl: 'https://newtheatre.org.uk/rota/manage/safety',
  pageUrl: 'https://newtheatre.org.uk/docs/communications/send-log',
  sessionsUrl: 'https://newtheatre.org.uk/training/sessions',
  trainingUrl: 'https://newtheatre.org.uk/training',
  registerUrl: 'https://newtheatre.org.uk/training/manage/register/1',
  rolesUrl: 'https://newtheatre.org.uk/people/accounts',
  claimUrl: 'https://newtheatre.org.uk/waiting-list/entry/tok',
  removeUrl: 'https://newtheatre.org.uk/waiting-list/leave/tok',
  imageUrl: 'https://newtheatre.org.uk/qr/r-1.sig/image.png',
  expiresAt: new Date('2026-10-02T18:30:00Z'),
  method: 'Google',
  room: 'The Studio',
  when: 'Friday 2 October 2026 at 19:30',
  title: 'Macbeth, act two',
  who: 'Bea Stone',
  reason: 'The room is closed that week',
  why: 'The room is closed that week',
  moved: 'The Green Room',
  offered: 'The Green Room',
  show: 'The Tempest',
  venue: 'The Nottingham New Theatre',
  venueName: 'The Nottingham New Theatre',
  oldVenue: 'The Studio',
  newVenue: 'The Green Room',
  role: 'door',
  severity: 'serious',
  category: 'near miss',
  path: '/docs/communications/send-log',
  reportedByName: 'Bea Stone',
  signedByName: 'Bea Stone',
  addedByName: 'Bea Stone',
  closingNote: 'A quiet house.',
  note: 'The interval ran long.',
  night: 'Friday 2 October 2026',
  officerBypass: false,
  heldOn: 'Friday 2 October 2026',
  startsAt: '19:30',
  where: 'The Studio',
  moduleName: 'Working at height',
  moduleId: 'WAH-1',
  period: 'October 2026',
  count: 3,
  first: 'Friday 2 October 2026',
  last: 'Friday 20 November 2026',
  preApprovalAt: 3,
  underPreApproval: false,
  formIsIn: true,
  dueBy: 'Friday 2 October 2026',
  settled: true,
  expiresOn: 'Friday 2 October 2026',
  releasesAt: 'Friday 2 October 2026 at 18:00',
  reference: 'K7M4PQ',
  totalDue: '£9.00',
  paid: '£9.00',
  passType: 'Season pass',
  priceLabel: '£25.00',
  qrWidth: 165,
  partySize: 2,
  expires: 'Friday 2 October 2026 at 18:00',
  since: 'Friday 2 October 2026 at 06:00',
  window: 4,
  final: 2,
  warningsCappedAt: null,
  armed: true,
  anonymised: 1,
  wouldAnonymise: 1,
  anonymisationsCappedAt: null,
  subject: 'The get-in moves to Sunday',
  body: 'The get-in moves to Sunday.',
  noun: 'room booking update',
  bookings: [{ room: 'The Studio', title: 'Macbeth, act two', when: 'Friday 2 October 2026 at 19:30' }],
  days: ['Friday 2 October 2026'],
  modules: [{ id: 'WAH-1', name: 'Working at height', expiresOn: 'Friday 2 October 2026' }],
  roles: [{ role: 'Front of house manager', lapsesOn: 'Friday 31 July 2026' }],
  permanent: [{ name: 'Bea Stone', role: 'Front of house manager' }],
  expiring: [{ name: 'Bea Stone', role: 'Front of house manager', lapsesOn: 'Friday 31 July 2026', moduleId: 'WAH-1', moduleName: 'Working at height', expiresOn: 'Friday 2 October 2026' }],
  expired: [{ name: 'Bea Stone', role: 'Front of house manager', lapsesOn: 'Friday 31 July 2026', moduleId: 'WAH-1', moduleName: 'Working at height', expiresOn: 'Friday 2 October 2026' }],
  lapsed: [{ name: 'Bea Stone', role: 'Front of house manager', lapsesOn: 'Friday 31 July 2026' }],
  entries: [{ subject: 'The Studio is yours', body: 'Friday 2 October 2026 at 19:30' }],
  performances: [{ show: 'The Tempest', venue: 'The Studio', when: 'Friday 2 October 2026', noTemplate: false, missingRoles: 'door', dutyManagerGap: true }],
}

// Every template, in both directions of each branch its context carries.
function everything(): { name: string, subject: string, html: string, text: string }[] {
  const variants = [
    {},
    { settled: false, underPreApproval: true, formIsIn: false, officerBypass: true, armed: false, partySize: 1 },
    { bookings: [], days: [], modules: [], roles: [], permanent: [], expiring: [], expired: [], lapsed: [], performances: [], offered: null, moved: null },
  ]
  const rendered: { name: string, subject: string, html: string, text: string }[] = []
  for (const name of TEMPLATE_NAMES) {
    for (const variant of variants) {
      const context = { ...EVERYTHING, ...variant }
      // A list template with nothing in it is never sent, so an empty variant that cannot render
      // is not a defect.
      try {
        rendered.push({ name, ...render(name, context) })
      }
      catch {
        continue
      }
    }
  }
  return rendered
}

describe('the house words (item 7)', () => {
  test('no template says "reservation" to a reader', () => {
    const offenders = everything()
      .filter(one => /reservation/i.test(`${one.subject} ${one.html} ${one.text}`))
      .map(one => one.name)
    expect([...new Set(offenders)]).toEqual([])
  })

  test('no template speaks of "the theatre" where "we" wins', () => {
    const offenders = everything()
      .filter(one => /the theatre (has|is|will|does)\b/i.test(`${one.subject} ${one.html} ${one.text}`))
      .map(one => one.name)
    expect([...new Set(offenders)]).toEqual([])
  })

  test('no template calls a room we do not manage "a room not listed here"', () => {
    const offenders = everything()
      .filter(one => /not listed here/i.test(`${one.subject} ${one.html} ${one.text}`))
      .map(one => one.name)
    expect([...new Set(offenders)]).toEqual([])
  })

  test('no template carries an em dash or an exclamation mark', () => {
    const offenders = everything()
      .filter(one => /[\u2014\u2013]|![ <\n]/.test(`${one.subject} ${one.html} ${one.text}`))
      .map(one => one.name)
    expect([...new Set(offenders)]).toEqual([])
  })
})

describe('one call to action per destination (item 7)', () => {
  const ALLOWED = ['See your bookings', 'Find another slot']

  test('every link to the bookings page reads one of the two allowed labels', () => {
    const labels = new Set<string>()
    for (const one of everything()) {
      for (const match of one.html.matchAll(new RegExp(`<a href="${ROOMS_URL}"[^>]*>([^<]+)</a>`, 'g'))) {
        labels.add(match[1]!)
      }
    }
    expect([...labels].sort()).toEqual([...ALLOWED].sort())
    for (const label of labels) expect(ALLOWED).toContain(label)
  })

  test('the dropped labels are gone from both parts', () => {
    const offenders = everything()
      .filter(one => /See what you hold|check your bookings|See what you have asked for/.test(`${one.html} ${one.text}`))
      .map(one => one.name)
    expect([...new Set(offenders)]).toEqual([])
  })
})

describe('an unsolicited link says where it goes (item 7)', () => {
  const LINE = 'The link goes to newtheatre.org.uk; if it does not, do not open it.'

  for (const name of ['set-password', 'account-claim', 'method-removed']) {
    test(`${name} names the domain in both parts`, () => {
      const { html, text } = render(name, EVERYTHING)
      expect(html).toContain(LINE)
      expect(text).toContain(LINE)
    })
  }
})

describe('the rewritten bodies and subjects (item 7)', () => {
  test('set-password says "we", not "the theatre"', () => {
    const { html, text } = render('set-password', EVERYTHING)
    expect(html).toContain('We have made you an account.')
    expect(text).toContain('We have made you an account.')
  })

  test('account-claim says we already know the address', () => {
    expect(render('account-claim', EVERYTHING).html).toContain('We already know this address, from a booking or from our old records')
  })

  test('role-expiring says our year, and names the IT Manager', () => {
    const { html } = render('role-expiring', EVERYTHING)
    expect(flat(html)).toContain('Committee roles run to the end of our year')
    expect(flat(html)).toContain(`ask the ${saysRole('ADMIN')} to renew`)
  })

  test('the unpaid hold calls it a booking and says the seats may be sold', () => {
    const { html, text } = render('reservation-hold-expiring', EVERYTHING)
    expect(html).toContain('Your unpaid booking K7M4PQ')
    expect(html).toContain('may be sold to somebody else')
    expect(text).toContain('may be sold to somebody else')
  })

  test('the confirmation says not yet paid in plain weight, and is a booking', () => {
    const { subject, html } = render('reservation-confirmed', EVERYTHING)
    expect(subject).toBe('Your booking for The Tempest')
    expect(flat(html)).toContain('Not yet paid: £9.00 is due at the box office on the night.')
    expect(flat(html)).toContain('This booking holds your seats and is not a purchase until then.')
    expect(html).not.toContain('UNPAID')
  })

  test('the cancellation is a booking that was still unpaid', () => {
    const { subject, html } = render('reservation-cancelled', EVERYTHING)
    expect(subject).toBe('Your booking for The Tempest is cancelled')
    expect(html).toContain('the booking was still unpaid')
  })

  test('the reassignment names the Front of House Manager', () => {
    expect(render('shift-removed', EVERYTHING).html)
      .toContain(`The ${saysRole('FOH_MANAGER')} has reassigned your door shift`)
  })

  test('a room request names the Theatre Manager from the wording map', () => {
    expect(render('room-requested', EVERYTHING).html)
      .toContain(`is with the ${saysRole('THEATRE_MANAGER')}`)
  })

  test('a declined shift leaves the open list open', () => {
    expect(render('shift-declined', EVERYTHING).html)
      .toContain('The shift stays on the open list, and so does everything else you are welcome to claim.')
  })

  test('a declined membership claim names a role that exists', () => {
    const { html } = render('membership-claim-declined', EVERYTHING)
    expect(html).toContain('speak to the committee')
    expect(html).not.toContain('membership secretary')
  })

  test('the waiting officer notice carries the queue link', () => {
    const { html, text } = render('room-request-waiting', EVERYTHING)
    expect(html).toContain('https://newtheatre.org.uk/admin/requests')
    expect(text).toContain('https://newtheatre.org.uk/admin/requests')
  })

  test('the safety notice links the list rather than describing it', () => {
    const { html } = render('incident-follow-up-required', EVERYTHING)
    expect(html).toContain('https://newtheatre.org.uk/rota/manage/safety')
    expect(html).not.toContain('Open the safety officer\'s list to read and close it.')
  })

  test('a drift report links the page rather than printing it as code', () => {
    const { html } = render('docs-drift-reported', EVERYTHING)
    expect(html).toContain('https://newtheatre.org.uk/docs/communications/send-log')
    expect(html).not.toContain('<code>')
  })

  test('an unsigned night report says so in words', () => {
    expect(render('night-report-auto-closed', EVERYTHING).subject)
      .toBe('Nobody signed off the night report: The Nottingham New Theatre, Friday 2 October 2026')
  })

  test('a scheduled training request leads with the module', () => {
    const { subject, html } = render('training-request-scheduled', EVERYTHING)
    expect(subject).toBe('Working at height is now scheduled')
    expect(flat(html)).toContain('You asked for Working at height to be taught, and a session is now in the diary. Thank you for asking.')
  })

  test('a missed session says what it is, and reassures once', () => {
    const { subject, html } = render('training-session-absent', EVERYTHING)
    expect(subject).toBe('The session on Friday 2 October 2026: no record yet')
    expect(html).toContain('Nothing on your record has changed; the module is still outstanding.')
  })

  test('the expiry window subject says what it is, and the splice is gone', () => {
    const { subject, html, text } = render('training-expiry-window', EVERYTHING)
    expect(subject).toBe('Your training expires before long')
    expect(flat(html)).toContain('Expired training does not disappear from your record. It just stops counting')
    expect(flat(text)).not.toContain('from your record, it just stops counting')
  })

  test('joining a waiting list is not contracted', () => {
    expect(render('waiting-list-joined', EVERYTHING).subject).toBe('You are on the waiting list for The Tempest')
  })

  test('a series is booked in bookings, not rehearsals', () => {
    expect(render('room-series-booked', EVERYTHING).subject).toBe('Booked: 3 bookings in The Studio')
    expect(render('room-series-requested', EVERYTHING).subject).toBe('Asked for: 3 bookings in The Studio')
  })

  test('a relisted request matches its siblings', () => {
    expect(render('request-relisted', EVERYTHING).subject).toBe('Asked for: The Studio, Friday 2 October 2026 at 19:30')
    expect(render('request-relisted', { ...EVERYTHING, settled: false }).subject)
      .toBe('Asked for: The Studio, Friday 2 October 2026 at 19:30')
  })

  test('a no-show counts in words', () => {
    expect(flat(render('room-no-show', EVERYTHING).html)).toContain('That is the 3rd booking not used this year.')
  })

  test('the magic link says the same thing in both parts', () => {
    const { html, text } = render('magic-link', EVERYTHING)
    expect(html).toContain('If you did not ask for it, ignore it: nothing has changed.')
    expect(text).toContain('If you did not ask for it, ignore it: nothing has changed.')
    expect(html).not.toContain('signs nobody in')
  })

  test('the operational notices are plain (item 7)', () => {
    expect(render('health-alert', EVERYTHING).subject)
      .toBe('The site health check has been failing since Friday 2 October 2026 at 06:00')
    expect(render('health-alert', EVERYTHING).html).not.toContain('<code>')

    const dry = render('retention-digest', { ...EVERYTHING, armed: false })
    expect(dry.html).toContain('Retention is still in rehearsal mode: nothing was anonymised')
    expect(dry.html).not.toContain('dry-run')

    const quiet = render('training-expiry-digest', { ...EVERYTHING, expiring: [], expired: [] })
    expect(flat(quiet.html)).toContain('If this email ever stops arriving, the monthly sweep has stopped running')
    expect(quiet.html).not.toContain('clockwork')
  })
})

describe('the waiting-list offer agrees in number (item 7)', () => {
  test('one seat is singular in the subject and on the button', () => {
    const { subject, html } = render('waiting-list-offered', { ...EVERYTHING, partySize: 1 })
    expect(subject).toBe('A seat has come free for The Tempest')
    expect(html).toContain('1 seat')
    expect(html).toContain('Claim my seat<')
  })

  test('more than one seat is plural in the subject and on the button', () => {
    const { subject, html } = render('waiting-list-offered', { ...EVERYTHING, partySize: 3 })
    expect(subject).toBe('Seats have come free for The Tempest')
    expect(html).toContain('3 seats')
    expect(html).toContain('Claim my seats<')
  })
})

describe('ordinal (item 7)', () => {
  test('the ordinary suffixes', () => {
    expect([1, 2, 3, 4, 5, 10].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '5th', '10th'])
  })

  test('the teens are all th', () => {
    expect([11, 12, 13, 14].map(ordinal)).toEqual(['11th', '12th', '13th', '14th'])
  })

  test('the suffix follows the last digit past twenty', () => {
    expect([21, 22, 23, 101, 111, 112].map(ordinal)).toEqual(['21st', '22nd', '23rd', '101st', '111th', '112th'])
  })
})

describe('the shared labels (item 8)', () => {
  test('saysStatus never yields an enum word', () => {
    for (const status of ['CONFIRMED', 'PENDING_APPROVAL', 'REJECTED', 'CANCELLED', 'BUMPED', 'SOMETHING_ELSE']) {
      expect(saysStatus(status)).not.toMatch(/[A-Z_]/)
    }
    expect(saysStatus('PENDING_APPROVAL')).toBe('waiting on a decision')
    expect(saysStatus('SOMETHING_ELSE')).toBe('settled')
  })

  test('a bumped booking was given to another booking', () => {
    expect(saysBookingState({ status: 'BUMPED' })).toBe('Given to another booking')
    expect(saysStatus('BUMPED')).toBe('given to another booking')
  })

  test('a converted request moved to a room we do not manage', () => {
    expect(saysBookingState({ status: 'CANCELLED', convertedToRequestId: 'r-1' }))
      .toBe('Moved to a room we do not manage')
  })

  test('every role name is a Title Case proper title', () => {
    for (const role of ROLES) {
      // "of" is the one word a title leaves lower case; everything else is capitalised.
      const lower = saysRole(role).split(' ').filter(word => !/^[A-Z]/.test(word))
      expect(lower.filter(word => word !== 'of')).toEqual([])
    }
    expect(saysRole('ADMIN')).toBe('IT Manager')
    expect(saysRole('FOH_MANAGER')).toBe('Front of House Manager')
  })

  // Retired, but an audit entry written before 0090 still names it, and should read as a title.
  test('the retired box office role still names a person, not a desk', () => {
    expect(saysRole('BOX_OFFICE')).toBe('Box Office Manager')
  })
})
