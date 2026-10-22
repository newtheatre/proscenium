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
const ACCESS_URL = 'https://newtheatre.org.uk/account/access'

// A part is wrapped for the plain-text reader, so a sentence is matched without its line breaks.
const flat = (part: string): string => part.replace(/\s+/g, ' ')

// One context wide enough for every template: a template reads only the keys it needs, and
// `render` refuses any part that came out holding `undefined`.
const EVERYTHING: TemplateContext = {
  name: 'Ada',
  taught: 'Working at height',
  missing: 'TECH-101 Ladder safety',
  standing: 'You have a place.',
  sessionUrl: 'https://newtheatre.org.uk/training/manage/sessions/1',
  url: 'https://newtheatre.org.uk/reset/abc',
  signInUrl: 'https://newtheatre.org.uk/sign-in',
  wanted: 'ada.new@example.invalid',
  cancelUrl: 'https://newtheatre.org.uk/account/profile#email',
  securityUrl: 'https://newtheatre.org.uk/account/access',
  accountUrl: 'https://newtheatre.org.uk/my',
  membershipUrl: 'https://newtheatre.org.uk/account/membership',
  accessUrl: ACCESS_URL,
  roomsUrl: ROOMS_URL,
  queueUrl: 'https://newtheatre.org.uk/admin/requests',
  safetyUrl: 'https://newtheatre.org.uk/rota/manage/safety',
  pageUrl: 'https://newtheatre.org.uk/docs/communications/send-log',
  sessionsUrl: 'https://newtheatre.org.uk/training/sessions',
  trainingUrl: 'https://newtheatre.org.uk/training',
  registerUrl: 'https://newtheatre.org.uk/training/manage/register/1',
  rolesUrl: 'https://newtheatre.org.uk/people/accounts',
  entryUrl: 'https://newtheatre.org.uk/waiting-list/entry/tok',
  termsUrl: 'https://newtheatre.org.uk/policies/booking',
  valid: '21 Oct to 18 Apr',
  shows: 'The Seagull, Small Hours',
  imageUrl: 'https://newtheatre.org.uk/qr/r-1.sig/image.png',
  expiresAt: new Date('2026-10-02T18:30:00Z'),
  method: 'Google',
  room: 'The Studio',
  when: 'Friday 2 October 2026 at 19:30',
  title: 'Macbeth, act two',
  who: 'Bea Stone',
  claimant: 'Amy Volunteer',
  reason: 'The room is closed that week',
  why: 'The room is closed that week',
  moved: 'The Green Room',
  offered: 'The Green Room',
  show: 'The Tempest',
  venue: 'The Nottingham New Theatre',
  venueName: 'The Nottingham New Theatre',
  oldVenue: 'The Studio',
  was: 'Thursday 1 October 2026 at 19:30',
  wasVenue: 'The Studio',
  newVenue: 'The Green Room',
  role: 'door',
  severity: 'serious',
  category: 'near miss',
  path: '/docs/communications/send-log',
  reportedByName: 'Bea Stone',
  signedByName: 'Bea Stone',
  signedByFirstName: 'Bea',
  figures: ['Sold: 40 seats', 'Box office: £120.00'],
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
  position: 2,
  first: 'Friday 2 October 2026',
  last: 'Friday 20 November 2026',
  times: '19:30 to 21:30',
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
  refunded: '£9.00',
  passType: 'Season pass',
  priceLabel: '£25.00',
  qrWidth: 165,
  guidance: ['Age guidance: Recommended 14 and over', 'Content warnings: Strobe lighting; Gun violence: depicted'],
  showUrl: 'https://newtheatre.org.uk/shows/the-tempest',
  partySize: 2,
  expires: 'Friday 2 October 2026 at 18:00',
  since: 'Friday 2 October 2026 at 06:00',
  window: 4,
  final: 2,
  warningsCappedAt: null,
  armed: true,
  anonymised: 1,
  refused: 0,
  wouldAnonymise: 1,
  anonymisationsCappedAt: null,
  unconfirmed: false,
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
    { unconfirmed: true, settled: false, underPreApproval: true, formIsIn: false, officerBypass: true, armed: false, partySize: 1 },
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

  // Issue 1346: one name for these rooms, on every screen and in every message.
  test('no template calls a Students\' Union room "not listed here" or "a room we do not manage"', () => {
    const offenders = everything()
      .filter(one => /not listed here|rooms? we do not manage/i.test(`${one.subject} ${one.html} ${one.text}`))
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

  test('email-change-requested links the cancel in both parts (0151)', () => {
    const { html, text } = render('email-change-requested', EVERYTHING)
    expect(html).toContain('href="https://newtheatre.org.uk/account/profile#email"')
    expect(flat(text)).toContain('cancel it (https://newtheatre.org.uk/account/profile#email)')
  })

  test('account-claim says we already know the address', () => {
    expect(render('account-claim', EVERYTHING).html).toContain('We already know this address, from a booking, a training record or our old records')
  })

  test('account-claim on an unconfirmed registration says why a password is asked for again (0153)', () => {
    expect(render('account-claim', { ...EVERYTHING, unconfirmed: true }).html).toContain('it was never confirmed, so we cannot tell whether the password chosen was yours')
  })

  test('role-expiring says our year, and names the IT Manager', () => {
    const { html } = render('role-expiring', EVERYTHING)
    expect(flat(html)).toContain('Committee roles run to the end of our year')
    expect(flat(html)).toContain(`ask the ${saysRole('ADMIN')} to renew`)
    expect(flat(html)).toContain('Your roles are listed on <a href="https://newtheatre.org.uk/my">My NNT</a>.')
  })

  test('the unpaid hold calls it a booking and says the seats may be sold', () => {
    const { html, text } = render('reservation-hold-expiring', EVERYTHING)
    expect(html).toContain('Your unpaid booking K7M4PQ')
    expect(html).toContain('may be sold to somebody else')
    expect(text).toContain('may be sold to somebody else')
  })

  // Issue 1330: the email is the e-ticket D-102 criterion 4 names, so the show's guidance travels
  // with it, beside a link to the show page that carries the rest.
  test('the confirmation carries the show\'s age guidance and warnings, and links the show page', () => {
    const { html, text } = render('reservation-confirmed', EVERYTHING)
    for (const part of [html, text]) {
      expect(part).toContain('Before you come')
      expect(part).toContain('Age guidance: Recommended 14 and over')
      expect(part).toContain('Content warnings: Strobe lighting; Gun violence: depicted')
    }
    expect(html).toContain('href="https://newtheatre.org.uk/shows/the-tempest"')
    expect(text).toContain('https://newtheatre.org.uk/shows/the-tempest')
  })

  // Age guidance is an officer's own words, so it never reaches the HTML part as markup.
  test('the guidance is escaped in the HTML part', () => {
    const { html } = render('reservation-confirmed', { ...EVERYTHING, guidance: ['Age guidance: <b>14+</b>'] })
    expect(html).toContain('&lt;b&gt;14+&lt;/b&gt;')
    expect(html).not.toContain('<b>14+</b>')
  })

  // Issue 1329: the reminder said pay or cancel and carried no way to do either. Cancelling is a
  // confirmed step on the booking page, never a link in an email a scanner might follow.
  test('the unpaid hold opens the booking and carries its QR, with no one-click cancel', () => {
    const { html, text } = render('reservation-hold-expiring', EVERYTHING)
    expect(html).toContain(`<a href="${String(EVERYTHING.url)}">Open your booking</a>`)
    expect(html).toContain(`src="${String(EVERYTHING.imageUrl)}"`)
    expect(text).toContain(`Open your booking: ${String(EVERYTHING.url)}`)
    for (const part of [html, text]) expect(part).not.toContain('/cancel')
  })

  test('the confirmation says not yet paid in plain weight, and is a booking', () => {
    const { subject, html } = render('reservation-confirmed', EVERYTHING)
    expect(subject).toBe('Your booking for The Tempest')
    expect(flat(html)).toContain('Not yet paid: £9.00 is due at the box office on the night.')
    expect(flat(html)).toContain('This booking holds your seats and is not a purchase until then.')
    expect(html).not.toContain('UNPAID')
  })

  // Issue 1390: a booking made with a pass owes nothing, so it never reads "£0.00 is due".
  test('a booking with nothing to collect says there is nothing to pay', () => {
    const { html, text } = render('reservation-confirmed', { ...EVERYTHING, nothingDue: true })
    for (const part of [flat(html), flat(text)]) {
      expect(part).toContain('Nothing to pay: this booking was made with your pass.')
      expect(part).not.toContain('Not yet paid')
    }
  })

  // 0170: a guest typed this account's address in another name, so the owner learns and can cancel.
  test('a booking made with the address in another name tells the owner how to undo it', () => {
    const { html, text } = render('reservation-confirmed', { ...EVERYTHING, bookedAs: 'Zed <Zane>' })
    expect(flat(text)).toContain('This booking was made online with your email address in the name Zed <Zane>. If that was not you, open your booking and cancel it.')
    expect(html).toContain('in the name Zed &lt;Zane&gt;')
    expect(flat(render('reservation-confirmed', EVERYTHING).text)).not.toContain('in the name')
  })

  // D-115 criterion 6: the desk's walk-up sends the till's confirmation, naming where it was paid.
  test('a walk-up paid at the desk says the box office, and one at the bar says the bar', () => {
    expect(flat(render('reservation-walk-up-paid', { ...EVERYTHING, paidAt: 'DESK' }).text)).toContain('paid at the box office')
    expect(flat(render('reservation-walk-up-paid', { ...EVERYTHING, paidAt: 'BAR' }).text)).toContain('paid at the bar')
  })

  test('a comp collected at the desk says it was given, not paid', () => {
    const text = flat(render('reservation-walk-up-paid', { ...EVERYTHING, paidAt: 'DESK', comp: true }).text)
    expect(text).toContain('complimentary, given at the box office')
    expect(text).not.toContain('paid at')
  })

  test('a refund names the amount and whether the booking still stands', () => {
    const part = render('reservation-refunded', { ...EVERYTHING, refunded: '£6.00', cancelled: false })
    expect(part.subject).toBe('£6.00 refunded on your booking for The Tempest')
    expect(flat(part.text)).toContain('The rest of the booking stands')
    expect(flat(render('reservation-refunded', { ...EVERYTHING, refunded: '£6.00', cancelled: true }).text)).toContain('it is cancelled')
  })

  // D-121 criterion 5: every holder is told, and a paid one where the money comes back (D-116).
  test('a cancelled performance tells a paid holder to come to the box office, and gives the reason', () => {
    const { subject, text } = render('reservation-performance-cancelled', { ...EVERYTHING, collected: true, reason: 'The lead is unwell' })
    expect(subject).toBe('Cancelled: The Tempest, Friday 2 October 2026 at 19:30')
    expect(flat(text)).toContain('The lead is unwell')
    expect(flat(text)).toContain('refunded at the box office')
  })

  test('a cancelled performance tells an unpaid holder there is nothing to do, and needs no reason', () => {
    const { text } = render('reservation-performance-cancelled', { ...EVERYTHING, collected: false, reason: null })
    expect(flat(text)).toContain('Nothing was charged')
    expect(flat(text)).not.toContain('refunded at the box office')
    expect(flat(text)).not.toContain('The room is closed that week')
  })

  // 0191: a moved performance says from what to what, and that the booking still stands.
  test('a moved performance names the old and new time and place, and keeps the booking', () => {
    const { subject, text } = render('reservation-performance-moved', { ...EVERYTHING, collected: false })
    expect(subject).toBe('The Tempest has moved: now Friday 2 October 2026 at 19:30')
    expect(flat(text)).toContain('from Thursday 1 October 2026 at 19:30 at The Studio to Friday 2 October 2026 at 19:30 at The Nottingham New Theatre')
    expect(flat(text)).toContain('still stands')
    expect(flat(text)).toContain('nothing has been charged')
  })

  test('a moved performance at the same venue names the venue once, and a paid holder is sent to the box office', () => {
    const { text } = render('reservation-performance-moved', { ...EVERYTHING, wasVenue: EVERYTHING.venue, collected: true })
    expect(flat(text)).toContain('to Friday 2 October 2026 at 19:30, at The Nottingham New Theatre.')
    expect(flat(text)).toContain('bring this reference to the box office')
  })

  test('the cancellation is a booking that was still unpaid', () => {
    const { subject, html } = render('reservation-cancelled', EVERYTHING)
    expect(subject).toBe('Your booking for The Tempest is cancelled')
    expect(html).toContain('the booking was still unpaid')
  })

  test('the reassignment names the Front of House Manager', () => {
    expect(render('shift-removed', { ...EVERYTHING, replaced: true }).html)
      .toContain(`The ${saysRole('FOH_MANAGER')} has reassigned your door shift`)
  })

  // 0212: nobody replaced them, so nothing says "reassigned".
  test('a stand-down says they were taken off and the shift is open again', () => {
    const { subject, html } = render('shift-removed', { ...EVERYTHING, replaced: false })
    expect(subject).toBe('You have been taken off your door shift on The Tempest')
    expect(html).toContain('The shift is open again for somebody else to take.')
    expect(html).not.toContain('reassigned')
  })

  test('an assignment and a confirmation give the call time, not only the curtain', () => {
    expect(flat(render('shift-assigned', { ...EVERYTHING, callTime: '20:30' }).text)).toContain('Your call time is 20:30.')
    expect(flat(render('shift-approved', { ...EVERYTHING, callTime: '20:30' }).text)).toContain('Your call time is 20:30.')
    expect(render('shift-assigned', { ...EVERYTHING, callTime: undefined }).text).not.toContain('call time')
  })

  test('a release links the rota board, and a withdrawn claim says withdrawn', () => {
    const released = render('shift-released', { ...EVERYTHING, url: 'https://newtheatre.org.uk/rota/manage/shifts' })
    expect(released.html).toContain('href="https://newtheatre.org.uk/rota/manage/shifts"')
    expect(render('shift-released', { ...EVERYTHING, withdrawn: true }).subject).toBe('A claim on a door shift on The Tempest has been withdrawn')
  })

  test('a waiting claim names the claimant and links the queue', () => {
    const { subject, html } = render('shift-claim-waiting', { ...EVERYTHING, url: 'https://newtheatre.org.uk/rota/manage/shifts?waiting=true' })
    expect(subject).toBe('A door claim on The Tempest is waiting for you')
    expect(html).toContain('Amy Volunteer has claimed the door shift')
    expect(html).toContain('href="https://newtheatre.org.uk/rota/manage/shifts?waiting=true"')
  })

  test('a room request names the Theatre Manager from the wording map', () => {
    expect(render('room-requested', EVERYTHING).html)
      .toContain(`is with the ${saysRole('THEATRE_MANAGER')}`)
  })

  // 0212: the declined shift stays DECLINED, off the open list, until it is reassigned or dismissed.
  test('a declined shift says it stays off the open list', () => {
    const { text } = render('shift-declined', EVERYTHING)
    expect(flat(text)).toContain(`That shift stays off the open list until the ${saysRole('FOH_MANAGER')} fills it or you dismiss the decline on your rota, which opens it again.`)
    expect(text).not.toContain('stays on the open list')
  })

  test('a declined membership claim names a role that exists', () => {
    const { html } = render('membership-claim-declined', EVERYTHING)
    expect(html).toContain('speak to the committee')
    expect(html).not.toContain('membership secretary')
  })

  test('the waiting claims notice counts them, says since when and links the queue (A-130 criterion 12)', () => {
    const queue = 'https://newtheatre.org.uk/people/members?filter=awaiting-record'
    const many = render('membership-claims-waiting', { ...EVERYTHING, count: 3, queueUrl: queue })
    expect(many.subject).toBe('3 membership claims are waiting to be recorded')
    expect(flat(many.html)).toContain('since Friday 2 October 2026 at 06:00')
    expect(many.html).toContain(queue)
    expect(many.text).toContain(queue)
    expect(render('membership-claims-waiting', { ...EVERYTHING, count: 1, queueUrl: queue }).subject)
      .toBe('1 membership claim is waiting to be recorded')
  })

  test('the waiting declarations notice counts them, says since when and links the queue (0156)', () => {
    const queue = 'https://newtheatre.org.uk/people/access'
    const many = render('access-profiles-waiting', { ...EVERYTHING, count: 2, queueUrl: queue })
    expect(many.subject).toBe('2 access declarations are waiting to be verified')
    expect(flat(many.html)).toContain('since Friday 2 October 2026 at 06:00')
    expect(many.text).toContain(queue)
    expect(render('access-profiles-waiting', { ...EVERYTHING, count: 1, queueUrl: queue }).subject)
      .toBe('1 access declaration is waiting to be verified')
  })

  // A-202, issue 1005: the SU's page where it is configured, and a clean sentence where it is not.
  test('the expiring and declined emails link the SU\'s purchase page only when there is one', () => {
    const buy = 'https://su.example.invalid/buy/new-theatre'
    for (const name of ['membership-expiring', 'membership-claim-declined']) {
      const linked = render(name, { ...EVERYTHING, purchaseUrl: buy })
      expect(linked.html).toContain(`href="${buy}"`)
      expect(linked.text).toContain(buy)

      const bare = render(name, { ...EVERYTHING, purchaseUrl: null })
      expect(bare.html).not.toContain('su.example.invalid')
      expect(`${bare.html} ${bare.text}`).not.toMatch(/undefined|null/)
    }
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

  // The 21 Oct process map: one click told the IT Manager a page was stale, and nothing about how.
  test('a drift report carries what the reader said is wrong, escaped, and reads whole without it', () => {
    const noted = render('docs-drift-reported', { ...EVERYTHING, note: 'The <b>Week</b> label changed' })
    expect(noted.text).toContain('What they said is out of date: The <b>Week</b> label changed')
    expect(noted.html).toContain('The &lt;b&gt;Week&lt;/b&gt; label changed')
    expect(render('docs-drift-reported', { ...EVERYTHING, note: '' }).text).not.toContain('What they said')
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
    const { subject, html } = render('training-session-absent', { ...EVERYTHING, taught: 'Sound basics' })
    expect(subject).toBe('Sound basics on Friday 2 October 2026: no record yet')
    expect(html).toContain('Nothing on your record has changed; the module is still outstanding.')
  })

  test('a correction says which way it moved somebody\'s record (0241)', () => {
    const context = { ...EVERYTHING, taught: 'Sound basics' }
    expect(render('training-session-withdrawn', context).subject).toBe('Your record for Sound basics has been withdrawn')
    expect(flat(render('training-session-added', context).html)).toContain('If we told you before that you were missed, this replaces that.')
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

  test('a series says its times once, for every week', () => {
    expect(flat(render('room-series-booked', EVERYTHING).text))
      .toContain('from Friday 2 October 2026 to Friday 20 November 2026, 19:30 to 21:30 each time.')
    expect(flat(render('room-series-requested', EVERYTHING).html))
      .toContain('from Friday 2 October 2026 to Friday 20 November 2026, 19:30 to 21:30 each time, is waiting')
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

    const holidays = render('bank-holidays-sync-failed', { ...EVERYTHING, since: '17 September 2026 at 06:00' })
    expect(holidays.subject).toBe('The bank holiday list has not updated from gov.uk since 17 September 2026 at 06:00')
    expect(holidays.text).toContain('Sync now')
    expect(holidays.html).not.toContain('BANK_HOLIDAYS')

    const dry = render('retention-digest', { ...EVERYTHING, armed: false })
    expect(dry.html).toContain('Retention is still in rehearsal mode: nothing was anonymised')
    expect(dry.html).not.toContain('dry-run')

    // A-120 criterion 6: the digest is the report anyone reads, so a held-back account is in it.
    const held = render('retention-digest', { ...EVERYTHING, refused: 3 })
    expect(held.text).toContain('3 due accounts were refused and are left for the next run.')
    expect(render('retention-digest', { ...EVERYTHING, refused: 1 }).text).toContain('1 due account was refused and is left for the next run.')
    expect(render('retention-digest', EVERYTHING).text).not.toContain('refused')

    const quiet = render('training-expiry-digest', { ...EVERYTHING, expiring: [], expired: [] })
    expect(flat(quiet.html)).toContain('If this email ever stops arriving, the monthly sweep has stopped running')
    expect(quiet.html).not.toContain('clockwork')
  })
})

// Special category data lives in the encrypted payload and on the owner's own page, so an answer
// to a declaration says only that there is one and where to read it (issue 1334, 0050).
describe('the access profile answers carry nothing that was declared or decided', () => {
  const secret = { ...EVERYTHING, fohNote: 'Aisle seat, assistance dog', reason: 'The card number did not match' }

  test('verified and declined each link the member to their own page, in both parts', () => {
    for (const name of ['access-profile-verified', 'access-profile-declined']) {
      const { html, text } = render(name, secret)
      expect(html).toContain(`href="${ACCESS_URL}"`)
      expect(text).toContain(ACCESS_URL)
    }
  })

  test('neither says the wording or the reason, whatever the context holds', () => {
    for (const name of ['access-profile-verified', 'access-profile-declined']) {
      const { subject, html, text } = render(name, secret)
      for (const part of [subject, html, text]) {
        expect(part).not.toContain('Aisle seat')
        expect(part).not.toContain('card number did not match')
      }
    }
  })

  test('the subjects say which answer it is', () => {
    expect(render('access-profile-verified', secret).subject).toBe('Your access requirements are verified')
    expect(render('access-profile-declined', secret).subject).toBe('We could not verify your access requirements')
  })
})

// G-106 criterion 6: a place taken away says so, gives the number, and keeps the way out.
describe('the move back to the waiting list (G-106 criterion 6)', () => {
  test('it names the session, the new number and that they keep their turn, in both parts', () => {
    const told = render('training-session-demoted', EVERYTHING)
    expect(told.subject).toContain('waiting list')
    for (const part of [flat(told.html), flat(told.text)]) {
      expect(part).toContain('Working at height (WAH-1)')
      expect(part).toContain('Friday 2 October 2026 at 19:30')
      expect(part).toContain('number 2 on the waiting list')
      expect(part).toContain('You keep your turn')
    }
    expect(told.html).toContain('href="https://newtheatre.org.uk/training/sessions"')
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

  // Issue 1328: an offer reserves nothing until it is claimed, so it is first refusal, not a hold.
  test('an offer is first refusal until its time, and never says the seats are held', () => {
    const { html, text } = render('waiting-list-offered', { ...EVERYTHING, partySize: 2 })
    for (const part of [html, text]) {
      expect(flat(part)).toContain('first refusal')
      expect(flat(part)).toContain('Friday 2 October 2026 at 18:00')
      expect(flat(part)).not.toContain('held for you')
    }
  })
})

// Issue 1340: the entry page names the show, the night and the party and leaves through a named
// confirmation, so every waiting-list email opens it, never a bare leave page.
describe('every waiting-list email opens the entry page (D-113 criterion 4)', () => {
  for (const name of ['waiting-list-joined', 'waiting-list-offered'] as const) {
    test(`${name} links the entry page for leaving, and no leave page`, () => {
      const { html, text } = render(name, { ...EVERYTHING, partySize: 2 })
      for (const part of [html, text]) {
        expect(part).toContain('https://newtheatre.org.uk/waiting-list/entry/tok')
        expect(part).not.toContain('/waiting-list/leave/')
        expect(flat(part)).toContain('Leave the waiting list')
      }
    })
  }
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

  test('a converted request moved to a Students\' Union room', () => {
    expect(saysBookingState({ status: 'CANCELLED', convertedToRequestId: 'r-1' }))
      .toBe('Moved to a Students\' Union room')
  })

  test('every role name is a Title Case proper title', () => {
    for (const role of ROLES) {
      // "of" and "and" are the words a title leaves lower case; everything else is capitalised.
      const lower = saysRole(role).split(' ').filter(word => !/^[A-Z]/.test(word))
      expect(lower.filter(word => word !== 'of' && word !== 'and')).toEqual([])
    }
    expect(saysRole('ADMIN')).toBe('IT Manager')
    expect(saysRole('FOH_MANAGER')).toBe('Front of House Manager')
  })

  // Retired, but an audit entry written before 0090 still names it, and should read as a title.
  test('the retired box office role still names a person, not a desk', () => {
    expect(saysRole('BOX_OFFICE')).toBe('Box Office Manager')
    expect(saysRole('FRONT_OF_HOUSE')).toBe('Front of House')
  })
})

// The rooms findings of 21 October 2026: what each rooms email says about the slot and the reason.
describe('the rooms emails (process map, rooms)', () => {
  const studio = { room: 'The Studio', title: 'Line run', when: 'Friday 2 October 2026, 19:30 to 21:30' }

  test('an approval into another room agrees in number', () => {
    const one = render('room-approved', { ...EVERYTHING, bookings: [studio], moved: 'The Studio' })
    expect(flat(one.text)).toContain('Your request has been approved. It is in The Studio, which is not the room asked for.')
    const two = render('room-approved', { ...EVERYTHING, bookings: [studio, studio], moved: 'The Studio' })
    expect(flat(two.text)).toContain('Your requests have been approved. They are in The Studio')
  })

  test('a reason that already ends a sentence gets no second full stop', () => {
    for (const reason of ['short notice.', 'short notice']) {
      const bumped = render('room-bumped', { ...EVERYTHING, reason })
      const closed = render('room-blackout-cancelled', { ...EVERYTHING, reason, bookings: [studio] })
      for (const part of [bumped.html, bumped.text, closed.html, closed.text]) {
        expect(flat(part)).toContain('short notice.')
        expect(part).not.toContain('short notice..')
      }
    }
  })

  test('a closure says asked for to somebody who only asked, and both to somebody who did both', () => {
    const booked = render('room-blackout-cancelled', { ...EVERYTHING, bookings: [studio] })
    expect(flat(booked.text)).toContain('A room you booked has been closed: The room is closed that week.')
    expect(flat(booked.text)).toContain('This booking is cancelled.')

    const asked = render('room-blackout-cancelled', { ...EVERYTHING, bookings: [{ ...studio, asked: true }] })
    expect(flat(asked.text)).toContain('A room you asked for has been closed')
    expect(flat(asked.text)).toContain('This request is cancelled.')
    expect(asked.text).not.toContain('you booked')

    const both = render('room-blackout-cancelled', { ...EVERYTHING, bookings: [studio, { ...studio, asked: true }] })
    expect(both.subject).toBe('Cancelled: 2 bookings and requests')
    expect(flat(both.text)).toContain('Rooms you booked or asked for have been closed')
    expect(flat(both.text)).toContain('These bookings and requests are cancelled.')
  })

  test('a turned down request carries its reason on its digest line', () => {
    const { subject, line } = render('room-rejected', { ...EVERYTHING, bookings: [studio], reason: 'Too short notice' })
    expect(line).toBe(`${subject}. Why: Too short notice.`)
  })
})

describe('the rooms digest is a line per change (0206)', () => {
  const entries = [
    { subject: 'Turned down: The Studio, Friday 2 October 2026, 19:30 to 21:30', body: 'Hello Ada, a whole message', line: 'Turned down: The Studio. Why: Short notice.' },
    { subject: 'Asked for: Green Room, Saturday 3 October 2026, 10:00 to 11:00', body: 'Hello Ada, another whole message' },
  ]
  const link = { url: ROOMS_URL, says: 'See your bookings' }

  test('the subject names the lead change and counts the rest', () => {
    const { subject } = render('notification-digest', { ...EVERYTHING, inLines: true, entries, link })
    expect(subject).toBe('Turned down: The Studio, Friday 2 October 2026, 19:30 to 21:30, and 1 more room booking update')
    expect(render('notification-digest', { ...EVERYTHING, inLines: true, entries: [entries[1]], link }).subject)
      .toBe('Asked for: Green Room, Saturday 3 October 2026, 10:00 to 11:00')
  })

  test('one greeting, one line each, one link, and no message nested inside another', () => {
    const { html, text } = render('notification-digest', { ...EVERYTHING, inLines: true, entries, link })
    for (const part of [html, text]) {
      expect(part.match(/Hello Ada/g)).toHaveLength(1)
      expect(part).toContain('Turned down: The Studio. Why: Short notice.')
      expect(part).toContain('Asked for: Green Room, Saturday 3 October 2026, 10:00 to 11:00')
      expect(part).not.toContain('a whole message')
      expect(part.match(/The Nottingham New Theatre/g)).toHaveLength(1)
    }
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(text).toContain(`See your bookings: ${ROOMS_URL}`)
  })

  test('another topic still nests each message whole', () => {
    const { subject, text } = render('notification-digest', { ...EVERYTHING, entries, noun: 'shift update' })
    expect(subject).toBe('2 Shift updates')
    expect(text).toContain('a whole message')
  })
})

// A guest's name or a member's display name is text in the HTML part, never markup, in an email
// the theatre sends from its own domain (issue 1391, 0011).
const MARKUP = `<b>&"'`
const ESCAPED = '&lt;b&gt;&amp;&quot;&#39;'

// Every string at any depth carries the markup; a Date, a number or a flag is left as it is.
function hostile(value: unknown): unknown {
  if (typeof value === 'string') return `${value}${MARKUP}`
  if (Array.isArray(value)) return value.map(hostile)
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, hostile(inner)]))
  }
  return value
}

describe('every typed value is escaped in the HTML part, and only there (issue 1391)', () => {
  const context = hostile({ ...EVERYTHING, purchaseUrl: 'https://su.example.invalid/buy' }) as TemplateContext

  for (const name of TEMPLATE_NAMES) {
    test(`${name}: the HTML part escapes every value; the subject and the text part keep it as typed`, () => {
      const rendered = render(name, context)
      expect(rendered.html).not.toContain('<b>')
      expect(rendered.html).toContain(ESCAPED)
      expect(rendered.html).not.toContain('&amp;lt;')
      expect(rendered.text).toContain(MARKUP)
      expect(rendered.subject).not.toContain('&lt;')
    })
  }

  test('an announcement body is still paragraphs, escaped once', () => {
    const rendered = render('admin-announcement', { ...EVERYTHING, body: 'One <b>\n\nTwo & three' })
    expect(rendered.html).toContain('<p>One &lt;b&gt;</p>')
    expect(rendered.html).toContain('<p>Two &amp; three</p>')
    expect(rendered.text).toContain('One <b>\n\nTwo & three')
  })

  // A closing note or a correction is typed prose: its paragraphs and line breaks reach the
  // letter as they were written (E-124 criteria 3 and 5, E-125 criterion 3).
  for (const [template, field] of [['night-report-signed', 'closingNote'], ['night-report-addendum', 'note'], ['night-report-auto-closed', 'closingNote']] as const) {
    test(`${template} keeps the note's paragraphs, escaped once`, () => {
      const note = 'Full house <b>\n\nBar ran out & closed early\nLate finish'
      const rendered = render(template, { ...EVERYTHING, [field]: note })
      expect(rendered.html).toContain('<p>Full house &lt;b&gt;</p>')
      expect(rendered.html).toContain('<p>Bar ran out &amp; closed early<br>Late finish</p>')
      expect(rendered.text).toContain(note)
    })
  }

  // The show, a British date and who signed lead the subject, and the figures lead the body (0239).
  test('the signed-off report names the show and carries the figures', () => {
    const rendered = render('night-report-signed', { ...EVERYTHING, night: 'Wed 21 Oct' })
    expect(rendered.subject).toBe('Night report: The Tempest, Wed 21 Oct, signed off by Bea')
    expect(rendered.text).toContain('Sold: 40 seats\nBox office: £120.00')
    expect(rendered.html).toContain('<li>Sold: 40 seats</li>')
  })

  test('a link keeps its address, escaped for the attribute it sits in', () => {
    const rendered = render('membership-expiring', { ...EVERYTHING, purchaseUrl: 'https://su.example.invalid/buy?a=1&b=2' })
    expect(rendered.html).toContain('href="https://su.example.invalid/buy?a=1&amp;b=2"')
    expect(rendered.text).toContain('https://su.example.invalid/buy?a=1&b=2')
  })
})

// D-137: the pass email says how to book ahead, that turning up is subject to space, and links the terms.
describe('the pass email follows the ticket terms (D-137)', () => {
  const { html, text } = render('pass-issued', EVERYTHING)

  test('it says booking ahead uses the pass, signed in on this email address', () => {
    for (const part of [html, text]) expect(flat(part)).toContain('To book ahead, sign in with this email address and choose "Use my pass" when you book.')
  })

  test('it says turning up without booking is subject to space', () => {
    for (const part of [html, text]) expect(flat(part)).toContain('You can also just turn up, subject to space on the night.')
  })

  test('it says when the pass is valid and which shows it covers, in both parts', () => {
    for (const part of [html, text]) expect(flat(part)).toContain('It is valid 21 Oct to 18 Apr. It covers The Seagull, Small Hours.')
  })

  test('a pass whose dates could not be read says nothing about them, rather than a half sentence', () => {
    const bare = render('pass-issued', { ...EVERYTHING, valid: '', shows: '' })
    for (const part of [bare.html, bare.text]) {
      expect(part).not.toContain('It is valid')
      expect(part).not.toContain('It covers')
    }
  })

  test('it links the ticket and pass terms in both parts', () => {
    expect(html).toContain('<a href="https://newtheatre.org.uk/policies/booking">The ticket and pass terms</a>')
    expect(text).toContain('The ticket and pass terms: https://newtheatre.org.uk/policies/booking')
  })
})
