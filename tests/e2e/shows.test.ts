import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, fillDate, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-121 and D-112 through the real routes and the real screen. What the window resolves to and
// what a draft show leaks are pinned in the unit and integration suites.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let boxOffice: TestMember
let member: TestMember
let venueId: string
const boxOfficePassword = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  member = await registerMember(app, 'ordinary', generatePassword())

  boxOffice = await registerMember(app, 'boxoffice', boxOfficePassword)
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'BOX_OFFICE' }, officer.cookie)

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

// Seed changes closed after Wave 0, so the venue a performance needs comes from tests/helpers.
function venue(): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: crypto.randomUUID().slice(0, 8) }).id
  }
  finally {
    database.close()
  }
}

function trail<T>(action: string, target: string): T | undefined {
  const database = new Database(app.databaseFile, { readonly: true })
  try {
    const row = database
      .query('SELECT actor_id AS actorId, detail FROM audit_log WHERE action = ? AND target = ?')
      .get(action, target) as { actorId: string, detail: string } | null
    return row ? { actorId: row.actorId, detail: JSON.parse(row.detail) } as T : undefined
  }
  finally {
    database.close()
  }
}

interface ListedShow {
  id: string
  slug: string
  title: string
  status: string
  ageGuidance: string | null
  latecomerPolicy: string | null
  bookingClosesHoursBefore: number | null
  performanceCount: number
  onSaleCount: number
  soldTickets: number
}

interface ListedPerformance {
  id: string
  venueId: string
  startsAt: number
  status: string
  bookingClosesHoursBefore: number | null
  soldTickets: number
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

async function addShow(over: Record<string, unknown> = {}, as = officer.cookie): Promise<Response> {
  const title = String(over.title ?? named('The Seagull'))
  return send('POST', '/api/admin/shows', { title, slug: slugged(title), ...over }, as)
}

async function newShow(over: Record<string, unknown> = {}): Promise<string> {
  const answered = await addShow(over)
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

// A week out, so a window of any sensible length is still open when the test asks.
const nextWeek = (offsetHours = 0): number => Math.floor(Date.now() / 1000) + 7 * 86_400 + offsetHours * 3600

async function addPerformance(showId: string, over: Record<string, unknown> = {}): Promise<string> {
  const answered = await send('POST', `/api/admin/shows/${showId}/performances`, {
    venueId,
    startsAt: nextWeek(),
    ...over,
  })
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

async function detail(showId: string, as = officer.cookie): Promise<{ show: ListedShow, performances: ListedPerformance[] }> {
  const answered = await send('GET', `/api/admin/shows/${showId}`, undefined, as)
  expect(answered.status).toBe(200)
  return await answered.json() as { show: ListedShow, performances: ListedPerformance[] }
}

describe.skipIf(skip !== null)('a show is a draft nobody outside can see until it is published (criterion 1)', () => {
  test('a show is created DRAFT, whatever the request asks for', async () => {
    const id = await newShow({ status: 'PUBLISHED' })
    expect((await detail(id)).show.status).toBe('DRAFT')
  })

  test('a show carries its copy, age guidance and latecomer policy', async () => {
    const id = await newShow()
    const title = named('The Cherry Orchard')
    expect((await send('PUT', `/api/admin/shows/${id}`, {
      title,
      slug: slugged(title),
      description: 'A comedy in four acts.',
      ageGuidance: '12 and over',
      latecomerPolicy: 'AT_INTERVAL',
    })).status).toBe(200)

    expect((await detail(id)).show).toMatchObject({
      title,
      ageGuidance: '12 and over',
      latecomerPolicy: 'AT_INTERVAL',
    })
  })

  test('a latecomer policy nobody defined is refused', async () => {
    const id = await newShow()
    const answered = await send('PUT', `/api/admin/shows/${id}`, { title: 'X', slug: 'x-x', latecomerPolicy: 'MAYBE' })
    expect(answered.status).toBe(400)
  })

  test('the public address is held once, and the refusal quotes it', async () => {
    const title = named('Twelfth Night')
    expect((await addShow({ title })).status).toBe(200)

    const again = await addShow({ title })
    expect(again.status).toBe(409)
    expect((await again.json() as { message?: string }).message).toContain(slugged(title))
  })

  test('a list endpoint answers with an envelope, never a bare array', async () => {
    const envelope = await (await send('GET', '/api/admin/shows?page=1&pageSize=2')).json() as Record<string, unknown>
    expect(Object.keys(envelope).sort()).toEqual(['items', 'page', 'pageSize', 'pages', 'total'])
  })
})

describe.skipIf(skip !== null)('publishing cascades, and a performance moves on its own (criterion 2)', () => {
  test('publishing takes draft performances on sale and leaves cancelled ones alone', async () => {
    const id = await newShow()
    const first = await addPerformance(id)
    const second = await addPerformance(id, { startsAt: nextWeek(24) })
    const cancelled = await addPerformance(id, { startsAt: nextWeek(48) })
    expect((await send('POST', `/api/admin/performances/${cancelled}/cancel`)).status).toBe(200)

    const answered = await send('POST', `/api/admin/shows/${id}/publish`, { published: true, cascadePerformances: true })
    expect(answered.status).toBe(200)
    expect((await answered.json() as { performancesTakenOnSale: number }).performancesTakenOnSale).toBe(2)

    const found = await detail(id)
    expect(found.show.status).toBe('PUBLISHED')
    const byId = new Map(found.performances.map(one => [one.id, one.status]))
    expect(byId.get(first)).toBe('ON_SALE')
    expect(byId.get(second)).toBe('ON_SALE')
    expect(byId.get(cancelled)).toBe('CANCELLED')
  })

  test('publishing without the cascade leaves every performance off sale', async () => {
    const id = await newShow()
    await addPerformance(id)
    expect((await send('POST', `/api/admin/shows/${id}/publish`, { published: true })).status).toBe(200)

    const found = await detail(id)
    expect(found.show.status).toBe('PUBLISHED')
    expect(found.performances.map(one => one.status)).toEqual(['DRAFT'])
  })

  test('one performance goes on and off sale without touching its neighbours', async () => {
    const id = await newShow()
    const matinee = await addPerformance(id, { startsAt: nextWeek(-5) })
    const evening = await addPerformance(id)
    await send('POST', `/api/admin/shows/${id}/publish`, { published: true, cascadePerformances: true })

    expect((await send('POST', `/api/admin/performances/${matinee}/sale`, { onSale: false })).status).toBe(200)

    const byId = new Map((await detail(id)).performances.map(one => [one.id, one.status]))
    expect(byId.get(matinee)).toBe('DRAFT')
    expect(byId.get(evening)).toBe('ON_SALE')
  })

  test('putting an on-sale performance on sale again is refused rather than silently accepted', async () => {
    const id = await newShow()
    const performance = await addPerformance(id)
    expect((await send('POST', `/api/admin/performances/${performance}/sale`, { onSale: true })).status).toBe(200)
    expect((await send('POST', `/api/admin/performances/${performance}/sale`, { onSale: true })).status).toBe(409)
  })

  test('publishing a published show is refused', async () => {
    const id = await newShow()
    expect((await send('POST', `/api/admin/shows/${id}/publish`, { published: true })).status).toBe(200)
    expect((await send('POST', `/api/admin/shows/${id}/publish`, { published: true })).status).toBe(409)
  })
})

describe.skipIf(skip !== null)('unpublishing closes sales and touches nothing sold (criterion 4)', () => {
  test('the performances keep their status and the act is audited', async () => {
    const id = await newShow()
    const performance = await addPerformance(id)
    await send('POST', `/api/admin/shows/${id}/publish`, { published: true, cascadePerformances: true })

    expect((await send('POST', `/api/admin/shows/${id}/publish`, { published: false })).status).toBe(200)

    const found = await detail(id)
    expect(found.show.status).toBe('DRAFT')
    expect(found.performances.map(one => one.id)).toEqual([performance])
    expect(found.performances.map(one => one.status)).toEqual(['ON_SALE'])

    const entry = trail<{ actorId: string, detail: { soldTickets: number } }>('show.unpublished', `show:${id}`)
    expect(entry?.actorId).toBe(officer.id)
    expect(entry?.detail.soldTickets).toBe(0)
  })
})

describe.skipIf(skip !== null)('a performance is cancelled, never deleted, once it has sold (criterion 5)', () => {
  test('cancelling says how many tickets are owed a refund', async () => {
    const id = await newShow()
    const performance = await addPerformance(id)

    const answered = await send('POST', `/api/admin/performances/${performance}/cancel`)
    expect(answered.status).toBe(200)
    expect(await answered.json()).toMatchObject({ status: 'CANCELLED', ticketsOwedARefund: 0 })

    const entry = trail<{ detail: { ticketsOwedARefund: number } }>('performance.cancelled', `performance:${performance}`)
    expect(entry?.detail.ticketsOwedARefund).toBe(0)
  })

  test('a cancelled performance cannot be put back on sale by the sale action', async () => {
    const id = await newShow()
    const performance = await addPerformance(id)
    await send('POST', `/api/admin/performances/${performance}/cancel`)

    expect((await send('POST', `/api/admin/performances/${performance}/sale`, { onSale: true })).status).toBe(409)
    expect((await send('POST', `/api/admin/performances/${performance}/cancel`)).status).toBe(409)
  })

  test('a performance nothing has sold for is deleted outright, and the trail says so', async () => {
    const id = await newShow()
    const performance = await addPerformance(id)

    expect((await send('DELETE', `/api/admin/performances/${performance}`)).status).toBe(200)
    expect((await detail(id)).performances).toEqual([])
    expect(trail('performance.deleted', `performance:${performance}`)).toBeDefined()
    expect((await send('DELETE', `/api/admin/performances/${performance}`)).status).toBe(404)
  })

  test('deleting a show takes its performances with it', async () => {
    const id = await newShow()
    await addPerformance(id)
    expect((await send('DELETE', `/api/admin/shows/${id}`)).status).toBe(200)
    expect((await send('GET', `/api/admin/shows/${id}`)).status).toBe(404)
  })
})

describe.skipIf(skip !== null)('the booking window is per performance and inherits the show (D-112 criterion 1)', () => {
  test('a performance with no window of its own reports none, and the show carries the default', async () => {
    const id = await newShow({ bookingClosesHoursBefore: 2 })
    const performance = await addPerformance(id)

    const found = await detail(id)
    expect(found.show.bookingClosesHoursBefore).toBe(2)
    expect(found.performances.find(one => one.id === performance)?.bookingClosesHoursBefore).toBeNull()
  })

  test('a performance window is recorded with its old and new value', async () => {
    const id = await newShow()
    const performance = await addPerformance(id, { bookingClosesHoursBefore: 2 })

    expect((await send('PUT', `/api/admin/performances/${performance}`, {
      venueId,
      startsAt: nextWeek(),
      bookingClosesHoursBefore: 4,
    })).status).toBe(200)

    const entry = trail<{ actorId: string, detail: { changes: { bookingClosesHoursBefore: { from: number, to: number } } } }>(
      'performance.updated',
      `performance:${performance}`,
    )
    expect(entry?.actorId).toBe(officer.id)
    expect(entry?.detail.changes.bookingClosesHoursBefore).toEqual({ from: 2, to: 4 })
  })

  test('the show default is recorded with its old and new value', async () => {
    const id = await newShow({ bookingClosesHoursBefore: 2 })
    const title = named('Windowed')
    expect((await send('PUT', `/api/admin/shows/${id}`, {
      title,
      slug: slugged(title),
      bookingClosesHoursBefore: 6,
    })).status).toBe(200)

    const entry = trail<{ detail: { changes: { bookingClosesHoursBefore: { from: number, to: number } } } }>(
      'show.updated',
      `show:${id}`,
    )
    expect(entry?.detail.changes.bookingClosesHoursBefore).toEqual({ from: 2, to: 6 })
  })

  test('a window longer than a month, or a negative one, is refused', async () => {
    const id = await newShow()
    for (const hours of [721, -1, 2.5]) {
      const answered = await send('POST', `/api/admin/shows/${id}/performances`, {
        venueId,
        startsAt: nextWeek(),
        bookingClosesHoursBefore: hours,
      })
      expect(answered.status).toBe(400)
    }
  })

  test('doors after curtain is refused', async () => {
    const id = await newShow()
    const answered = await send('POST', `/api/admin/shows/${id}/performances`, {
      venueId,
      startsAt: nextWeek(),
      doorsAt: nextWeek(1),
    })
    expect(answered.status).toBe(400)
  })
})

describe.skipIf(skip !== null)('who may administer the programme', () => {
  test('the box office officer may, and it is their screen', async () => {
    const title = named('Officer made')
    expect((await addShow({ title }, boxOffice.cookie)).status).toBe(200)
  })

  test('an ordinary member reads nothing and writes nothing', async () => {
    expect((await send('GET', '/api/admin/shows', undefined, member.cookie)).status).toBe(403)
    expect((await addShow({}, member.cookie)).status).toBe(403)
  })

  test('a signed-out caller is refused', async () => {
    expect([401, 403]).toContain((await send('GET', '/api/admin/shows', undefined, '')).status)
  })
})

describe.skipIf(skip !== null)('the screen', () => {
  async function signedIn(): Promise<Bun.WebView> {
    const view = await openSignedOutView(app.baseURL)
    await visit(view, `${app.baseURL}/sign-in`)
    await fill(view, 'form input[type="email"]', boxOffice.email)
    await fill(view, 'form input[type="password"]', boxOfficePassword)
    await click(view, 'form button[type="submit"]')
    await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
    return view
  }

  test('the box office officer sees a show, its state and its performances', async () => {
    const title = named('On screen')
    const id = await newShow({ title })
    await addPerformance(id)

    const view = await signedIn()

    // The console shell renders no <main>, so the screen names an element of its own.
    await visit(view, `${app.baseURL}/box-office/shows`, '[data-test="shows-table"]')
    expect(await textOf(view, '[data-test="shows-table"]')).toContain(title)

    await visit(view, `${app.baseURL}/box-office/shows/${id}`, '[data-test="performances-table"]')
    expect(await textOf(view, '[data-test="show-status"]')).toContain('Draft')
    expect(await textOf(view, '[data-test="performances-table"]')).toContain('Closes at curtain-up')
    view.close()
  }, 120_000)

  // The screen holds a day and a wall clock and the request holds an instant, so the form's own
  // schema has to be the screen's or the button submits nothing and says nothing.
  test('adding a performance from the screen puts it on the table', async () => {
    const id = await newShow({ title: named('Added on screen') })
    const view = await signedIn()
    await visit(view, `${app.baseURL}/box-office/shows/${id}`, '[data-test="performances-table"]')

    await click(view, '[data-test="add-performance"]')
    await waitFor(view, `document.querySelector('[data-test="performance-form"]')`)
    await fillDate(view, '[data-test="performance-day"]', '2027-03-04')
    await fill(view, '[data-test="performance-clock"]', '20:15')
    await click(view, '[data-test="performance-submit"]')

    await waitFor(view, `document.querySelector('[data-test="performances-table"]').textContent.includes('4 Mar 2027')`)
    expect(await textOf(view, '[data-test="performances-table"]')).toContain('20:15')
    expect((await detail(id)).performances.length).toBe(1)
    view.close()
  }, 120_000)
})
