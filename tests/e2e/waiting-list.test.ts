import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession } from '#tests/helpers/accounts'
import { sqliteTarget } from '#tests/helpers/database'
import { testVenue } from '#tests/helpers/programme'
import { expectOneWinner, race } from '#tests/helpers/race'
import { registrableAddress } from '#tests/helpers/seed'
import { click, fill, fillNumber, letters, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-113 criteria 1 and 4 through the real routes and the real screens. The statements themselves
// are pinned in tests/integration/waiting-list.test.ts.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let venueId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  venueId = venue()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = officer.cookie): Promise<Response> =>
  fetch(`${app.baseURL}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'cookie': as },
    ...(method === 'GET' || method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
  })

function venue(): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8), capacity: 1 }).id
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const nextWeek = (): number => Math.floor(Date.now() / 1000) + 7 * 86_400

async function bookableShow(): Promise<{ showId: string, performanceId: string }> {
  const title = named('The Cherry Orchard')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt: nextWeek(), durationMinutes: 120 })
  const performanceId = (await performance.json() as { id: string }).id

  await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { showId, performanceId }
}

// An hour out, with the performance's own hold release, so the test decides where online booking
// stops: the offer window's two hours would otherwise run all the way to curtain.
async function soonShow(holdReleaseMinutesBefore: number): Promise<{ performanceId: string, startsAt: number }> {
  const title = named('The Cherry Orchard')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id

  const startsAt = Math.floor(Date.now() / 1000) + 60 * 60
  const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt, durationMinutes: 120 })
  const performanceId = (await performance.json() as { id: string }).id
  expect((await send('PUT', `/api/admin/performances/${performanceId}`, {
    venueId, startsAt, durationMinutes: 120, intervalCount: 0, holdReleaseMinutesBefore,
  })).status).toBe(200)

  await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

  return { performanceId, startsAt }
}

function offerFor(performanceId: string): { status: string, offerExpiresAt: number | null } | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT status, offer_expires_at AS offerExpiresAt FROM waiting_list WHERE performance_id = ?')
      .get(performanceId) as { status: string, offerExpiresAt: number | null } | undefined
  }
  finally {
    database.close()
  }
}

function entriesFor(performanceId: string): { id: string, status: string, reservationId: string | null }[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT id, status, claimed_reservation_id AS reservationId FROM waiting_list WHERE performance_id = ?').all(performanceId) as { id: string, status: string, reservationId: string | null }[]
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('a join is committed only alongside a link the joiner holds (criterion 1)', () => {
  test('the answer says the letter went, and the letter carries the entry link', async () => {
    const { performanceId } = await bookableShow()
    const email = registrableAddress('waiter')

    const answered = await send('POST', `/api/performances/${performanceId}/waiting-list`, {
      performanceId,
      partySize: 2,
      guest: { name: 'Ada Waiter', email },
    }, '')

    expect(answered.status).toBe(200)
    expect(await answered.json()).toEqual({ ok: true, emailed: true })

    const entries = entriesFor(performanceId)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe('WAITING')

    const letter = (await letters(app)).find(text => text.includes(email))
    expect(letter).toBeDefined()
    expect(letter).toContain('/waiting-list/entry/')
    expect(letter).not.toContain('/waiting-list/leave/')
  }, CASE_TIMEOUT_MS)

  test('a second join on the same address is refused and writes nothing more', async () => {
    const { performanceId } = await bookableShow()
    const email = registrableAddress('twice')
    const body = { performanceId, partySize: 1, guest: { name: 'Ada Twice', email } }

    expect((await send('POST', `/api/performances/${performanceId}/waiting-list`, body, '')).status).toBe(200)
    expect((await send('POST', `/api/performances/${performanceId}/waiting-list`, body, '')).status).toBe(409)
    expect(entriesFor(performanceId)).toHaveLength(1)
  }, CASE_TIMEOUT_MS)
})

// Issue 1329: a claim lands on the booking page itself, as a fresh booking does, rather than a
// panel whose link opened a server route inside the app and found nothing there.
describe.skipIf(skip !== null)('a claimed offer opens the booking it made (criterion 2)', () => {
  test('claiming lands on the booking page, headed booking made', async () => {
    const { performanceId } = await bookableShow()
    const email = registrableAddress('claimer')
    expect((await send('POST', `/api/performances/${performanceId}/waiting-list`, {
      performanceId, partySize: 1, guest: { name: 'Ada Claimer', email },
    }, '')).status).toBe(200)
    expect(await (await send('POST', `/api/box-office/desk/performances/${performanceId}/waiting-list/offer`)).json()).toEqual({ offered: 1 })

    const letter = (await letters(app)).find(text => text.includes(email)) ?? ''
    const entryUrl = letter.match(/https?:\/\/\S*\/waiting-list\/entry\/\S+/)?.[0]
    expect(entryUrl).toBeDefined()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, entryUrl!, '[data-test="waiting-list-offered"]')
      await fillNumber(view, '[data-test^="quantity-"]', '1')
      await click(view, '[data-test="waiting-list-claim-submit"]')
      await waitFor(view, `document.querySelector('[data-test="booking-made"]')`)
      expect(await view.evaluate<string>('location.pathname')).toBe('/qr')
      expect(await textOf(view, '[data-test="booking-found"]')).toContain('Reference')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('every email opens the entry page, and leaving goes through it (criterion 4)', () => {
  test('the remove route refuses an unknown token', async () => {
    const answered = await send('POST', '/api/waiting-list/not-a-real-token/remove', {}, '')
    expect(answered.status).toBe(404)
  }, CASE_TIMEOUT_MS)

  // Issue 1340: an email sent before the change still carries /leave/, which now opens the entry.
  test('an old leave link redirects to the entry page, which names the show, the night and the party', async () => {
    const { performanceId } = await bookableShow()
    const email = registrableAddress('old-link')
    expect((await send('POST', `/api/performances/${performanceId}/waiting-list`, {
      performanceId, partySize: 2, guest: { name: 'Ada Oldlink', email },
    }, '')).status).toBe(200)

    const letter = (await letters(app)).find(text => text.includes(email)) ?? ''
    const token = letter.match(/\/waiting-list\/entry\/(\S+)/)?.[1]
    expect(token).toBeDefined()

    const redirected = await fetch(`${app.baseURL}/waiting-list/leave/${token}`, { redirect: 'manual' })
    expect(redirected.status).toBe(301)
    expect(new URL(redirected.headers.get('location') ?? '', app.baseURL).pathname).toBe(`/waiting-list/entry/${token}`)

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/waiting-list/leave/${token}`, '[data-test="waiting-list-waiting"]')
      const says = await textOf(view, '[data-test="waiting-list-entry-page"]')
      expect(says).toContain('The Cherry Orchard')
      expect(says).toMatch(/\d{1,2}\s\w+\sat\s\d{2}:\d{2}/)
      expect(says).toContain('2 seats')
      expect(entriesFor(performanceId)[0]?.status).toBe('WAITING')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // The 301 and the entry page's not-found answer together: a link that no longer resolves says so.
  test('an old leave link with an unknown token ends on a page that says so', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await view.navigate(`${app.baseURL}/waiting-list/leave/not-a-real-token`)
      await waitFor(view, `document.querySelector('[data-test="error-ways"]')`)
      expect(await view.evaluate<string>('location.pathname')).toBe('/waiting-list/entry/not-a-real-token')
      expect(await textOf(view, 'main')).toContain('There is nothing here')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// Issue 1152 item 5: the join screen named no show and validated only blanks, and leaving from a
// live offer was one click with nothing said about what it costs.
describe.skipIf(skip !== null)('the join screen names what it is a list for (criterion 1)', () => {
  test('the show and the night are on the page before anybody fills anything in', async () => {
    const { performanceId } = await bookableShow()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/waiting-list/${performanceId}`, '[data-test="waiting-list-join-page"]')
      await waitFor(view, `document.querySelector('[data-test="waiting-list-for"]')`)

      const says = await textOf(view, '[data-test="waiting-list-for"]')
      expect(says).toContain('The Cherry Orchard')
      // The long London form the show page uses, so the night is unambiguous.
      expect(says).toMatch(/\d{1,2}\s\w+\sat\s\d{2}:\d{2}/)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a blank name and a malformed address each answer on their own field', async () => {
    const { performanceId } = await bookableShow()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/waiting-list/${performanceId}`, '[data-test="waiting-list-join-page"]')
      await fill(view, '[data-test="waiting-list-guest-email"]', 'not-an-address')
      await click(view, '[data-test="waiting-list-submit"]')
      await waitFor(view, `document.body.innerText.includes('does not look like an email address')`)

      const body = await textOf(view)
      expect(body).toContain('Tell us the name to hold the place under')
      expect(body).not.toContain('Invalid')
      expect(body).not.toContain('Required')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('leaving is asked about first (criterion 4)', () => {
  test('leaving opens a named confirmation, backing out leaves the entry alone, and once left it offers what is on', async () => {
    const { performanceId } = await bookableShow()
    const email = registrableAddress('asked')

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/waiting-list/${performanceId}`, '[data-test="waiting-list-join-page"]')
      await fill(view, '[data-test="waiting-list-guest-name"]', 'Ada Asked')
      await fill(view, '[data-test="waiting-list-guest-email"]', email)
      await click(view, '[data-test="waiting-list-submit"]')
      await waitFor(view, `document.querySelector('[data-test="waiting-list-joined"]')`)

      const letter = (await letters(app)).find(text => text.includes(email)) ?? ''
      const entryUrl = letter.match(/https?:\/\/\S*\/waiting-list\/entry\/\S+/)?.[0]
      expect(entryUrl).toBeDefined()

      await visit(view, entryUrl!, '[data-test="waiting-list-entry-page"]')
      await click(view, '[data-test="waiting-list-leave"]')
      await waitFor(view, `document.querySelector('[data-test="confirm-leave-waiting-list-verb"]')`)

      // The consequence is stated, not implied by a red button: for a place still waiting, the place
      // goes and the emails stop; only a standing offer passes to the next person (D-113 criterion 6).
      expect(await textOf(view)).toContain('Your place on the list goes')

      await click(view, '[data-test="confirm-leave-waiting-list-back"]')
      expect(entriesFor(performanceId)[0]?.status).toBe('WAITING')

      await click(view, '[data-test="waiting-list-leave"]')
      await waitFor(view, `document.querySelector('[data-test="confirm-leave-waiting-list-verb"]')`)
      await click(view, '[data-test="confirm-leave-waiting-list-verb"]')
      await waitFor(view, `document.querySelector('[data-test="waiting-list-removed"]')`)
      expect(entriesFor(performanceId)[0]?.status).toBe('REMOVED')
      expect(await view.evaluate<string | null>(`document.querySelector('[data-test="waiting-list-whats-on"]')?.getAttribute('href') ?? null`)).toBe('/whats-on')

      // Issue 1340: opening the link again says the list was left, and offers the same way on.
      await visit(view, entryUrl!, '[data-test="waiting-list-settled"]')
      expect(await textOf(view, '[data-test="waiting-list-settled"]')).toContain('You already left this waiting list')
      expect(await view.evaluate<boolean>(`document.querySelector('[data-test="waiting-list-whats-on"]') !== null`)).toBe(true)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

// Issue 1328: an offer reserves nothing, and a claim after the online cut-off is refused, so an
// offer is first refusal until the cut-off and nothing is offered past it.
describe.skipIf(skip !== null)('an offer stands until online booking closes, and none is made after (criterion 2)', () => {
  test('an offer made before the cut-off lapses at the cut-off, not at curtain, and says first refusal', async () => {
    const { performanceId, startsAt } = await soonShow(30)
    const email = registrableAddress('refusal')
    expect((await send('POST', `/api/performances/${performanceId}/waiting-list`, {
      performanceId, partySize: 1, guest: { name: 'Ada First', email },
    }, '')).status).toBe(200)

    const offered = await send('POST', `/api/box-office/desk/performances/${performanceId}/waiting-list/offer`)
    expect(offered.status).toBe(200)
    expect(await offered.json()).toEqual({ offered: 1 })

    const entry = offerFor(performanceId)
    expect(entry?.status).toBe('OFFERED')
    expect(entry?.offerExpiresAt).toBe(startsAt - 30 * 60)

    const letter = (await letters(app)).find(text => text.includes(email) && text.includes('first refusal'))
    expect(letter).toBeDefined()
    expect(letter).not.toContain('held for you')
  }, CASE_TIMEOUT_MS)

  test('past the cut-off nothing is offered, and a join is refused naming the door', async () => {
    const { performanceId, startsAt } = await soonShow(5)
    expect((await send('POST', `/api/performances/${performanceId}/waiting-list`, {
      performanceId, partySize: 1, guest: { name: 'Ada Early', email: registrableAddress('early') },
    }, '')).status).toBe(200)

    expect((await send('PUT', `/api/admin/performances/${performanceId}`, {
      venueId, startsAt, durationMinutes: 120, intervalCount: 0, holdReleaseMinutesBefore: 90,
    })).status).toBe(200)

    const offered = await send('POST', `/api/box-office/desk/performances/${performanceId}/waiting-list/offer`)
    expect(await offered.json()).toEqual({ offered: 0 })
    expect(offerFor(performanceId)?.status).toBe('WAITING')

    const late = await send('POST', `/api/performances/${performanceId}/waiting-list`, {
      performanceId, partySize: 1, guest: { name: 'Ada Late', email: registrableAddress('late') },
    }, '')
    expect(late.status).toBe(409)
    const says = await late.text()
    expect(says).toContain('Online booking closed at')
    expect(says).toContain('on the door')
    expect(entriesFor(performanceId)).toHaveLength(1)
  }, CASE_TIMEOUT_MS)
})

// Two nights of one show in the one-seat house, so a single booking fills the first night.
async function twoNightShow(): Promise<{ first: string, second: string, ticketTypeId: string }> {
  const title = named('The Cherry Orchard')
  const show = await send('POST', '/api/admin/shows', { title, slug: slugged(title) })
  const showId = (await show.json() as { id: string }).id
  const night = async (startsAt: number): Promise<string> => {
    const performance = await send('POST', `/api/admin/shows/${showId}/performances`, { venueId, startsAt, durationMinutes: 120 })
    return (await performance.json() as { id: string }).id
  }
  const first = await night(nextWeek())
  const second = await night(nextWeek() + 86_400)
  const type = await send('POST', '/api/admin/ticket-types', { name: named('Standard'), price: 900 })
  const ticketTypeId = (await type.json() as { id: string }).id
  expect((await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)
  return { first, second, ticketTypeId }
}

// An exchange frees the seats it leaves, the same as a cancel, so the list for that night is
// offered them; the offers run before the exchange's own confirmation is sent (issue 1328).
describe.skipIf(skip !== null)('an exchange offers the seats it frees to the waiting list (criterion 2)', () => {
  test('moving a booking to another night offers its old seat to that night\'s list', async () => {
    const { first, second, ticketTypeId } = await twoNightShow()
    const mover = registrableAddress('mover')
    const booked = await send('POST', '/api/reservations', {
      performanceId: first, lines: [{ ticketTypeId, quantity: 1 }], guest: { name: 'Ada Mover', email: mover },
    }, '')
    expect(booked.status).toBe(200)
    const { reference, qrToken } = await booked.json() as { reference: string, qrToken: string }

    const waiter = registrableAddress('waiter')
    expect((await send('POST', `/api/performances/${first}/waiting-list`, {
      performanceId: first, partySize: 1, guest: { name: 'Ada Waiter', email: waiter },
    }, '')).status).toBe(200)
    expect(entriesFor(first)[0]?.status).toBe('WAITING')

    const opened = await fetch(`${app.baseURL}/qr/${qrToken}`, { redirect: 'manual' })
    const cookie = (opened.headers.get('set-cookie') ?? '').split(';')[0]!
    const exchanged = await send('POST', '/api/qr/exchange', { performanceId: second, reference }, cookie)
    expect(exchanged.status).toBe(200)

    expect(entriesFor(first)[0]?.status).toBe('OFFERED')
    const sent = await letters(app)
    expect(sent.some(text => text.includes(waiter) && text.includes('first refusal'))).toBe(true)
    expect(sent.some(text => text.includes(mover) && text.includes('/qr/'))).toBe(true)
  }, CASE_TIMEOUT_MS)
})

function trailFor(action: string, entryId: string): { detail: string | null }[] {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    return database.query('SELECT detail FROM audit_log WHERE action = ? AND target = ?')
      .all(action, `waiting-list-entry:${entryId}`) as { detail: string | null }[]
  }
  finally {
    database.close()
  }
}

// 0049: an offer and a claim each write their trail row in the same batch as the change, so two
// runs at once record one offer, and two claims at once record one claim, naming its booking.
describe.skipIf(skip !== null)('an offer and a claim are recorded once, however many race (criteria 2, 3)', () => {
  test('two offer runs at once make one offer and one trail row', async () => {
    const { performanceId } = await bookableShow()
    expect((await send('POST', `/api/performances/${performanceId}/waiting-list`, {
      performanceId, partySize: 1, guest: { name: 'Ada Raced', email: registrableAddress('raced') },
    }, '')).status).toBe(200)

    const runs = await race(2, () => send('POST', `/api/box-office/desk/performances/${performanceId}/waiting-list/offer`))
    const offered = await Promise.all(runs.map(async run => (await run.json() as { offered: number }).offered))
    expect(offered.reduce((total, one) => total + one, 0)).toBe(1)

    const [entry] = entriesFor(performanceId)
    expect(entry?.status).toBe('OFFERED')
    expect(trailFor('waiting-list.offered', entry!.id)).toHaveLength(1)
  }, CASE_TIMEOUT_MS)

  test('two claims at once make one booking, and one trail row naming it', async () => {
    const { performanceId } = await bookableShow()
    const email = registrableAddress('claims')
    expect((await send('POST', `/api/performances/${performanceId}/waiting-list`, {
      performanceId, partySize: 1, guest: { name: 'Ada Twice', email },
    }, '')).status).toBe(200)
    expect(await (await send('POST', `/api/box-office/desk/performances/${performanceId}/waiting-list/offer`)).json()).toEqual({ offered: 1 })

    const letter = (await letters(app)).find(text => text.includes(email)) ?? ''
    const token = letter.match(/\/waiting-list\/entry\/(\S+)/)?.[1]
    expect(token).toBeDefined()
    const shown = await fetch(`${app.baseURL}/api/waiting-list/${token}`)
    const { ticketTypes } = await shown.json() as { ticketTypes: { id: string }[] }

    const claims = await race(2, () => fetch(`${app.baseURL}/api/waiting-list/${token}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [{ ticketTypeId: ticketTypes[0]!.id, quantity: 1 }] }),
    }))
    expectOneWinner(claims)

    const [entry] = entriesFor(performanceId)
    expect(entry?.status).toBe('CLAIMED')
    const trail = trailFor('waiting-list.claimed', entry!.id)
    expect(trail).toHaveLength(1)
    expect(JSON.parse(trail[0]!.detail ?? '{}')).toEqual({ reservationId: entry!.reservationId })
  }, CASE_TIMEOUT_MS)
})
