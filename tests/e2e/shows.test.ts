import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, fillDate, fillNumber, fillTime, openSignedOutView, pickOption, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
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
  await request(app, 'POST', '/api/admin/roles', { userId: boxOffice.id, role: 'FOH_MANAGER' }, officer.cookie)

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
function venue(options: { isExternal?: boolean } = {}): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue(sqliteTarget(database), { suffix: crypto.randomUUID().slice(0, 8), ...options }).id
  }
  finally {
    database.close()
  }
}

// A performance as the diary import left it: at a venue we run, with no running time.
function importedPerformance(showId: string): string {
  const database = new Database(app.databaseFile)
  try {
    const id = `performance-imported-${crypto.randomUUID().slice(0, 8)}`
    database.run('INSERT INTO performances (id, show_id, venue_id, starts_at, status) VALUES (?, ?, ?, ?, ?)', [id, showId, venueId, nextWeek(), 'DRAFT'])
    return id
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
  untimedPerformanceCount: number
  soldTickets: number
  capacity: number
  posterUrl: string | null
}

interface ListedPerformance {
  id: string
  venueId: string
  startsAt: number
  status: string
  bookingClosesHoursBefore: number | null
  externalBookingUrl: string | null
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
    durationMinutes: 120,
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

// A pass valid for half a year from now, so a performance a week out falls inside it. A pass has
// to cover one show to exist, so it starts with a show of its own unless told which.
async function passOnSale(over: { status?: string, covering?: string } = {}): Promise<{ id: string, name: string }> {
  const name = named('Season pass')
  const now = Math.floor(Date.now() / 1000)
  const window = { validFrom: now, validUntil: now + 180 * 86_400 }
  const showIds = [over.covering ?? await newShow()]
  const created = await send('POST', '/api/admin/pass-types', {
    name, slug: slugged(name), ...window, prices: [{ label: 'Standard', price: 4500 }], showIds,
  })
  expect(created.status).toBe(200)
  const { id } = await created.json() as { id: string }
  expect((await send('PUT', `/api/admin/pass-types/${id}`, {
    name, slug: slugged(name), ...window, prices: [{ label: 'Standard', price: 4500 }], status: over.status ?? 'ON_SALE',
  })).status).toBe(200)
  return { id, name }
}

async function coveredShows(passTypeId: string): Promise<string[]> {
  const answered = await send('GET', `/api/admin/pass-types/${passTypeId}`)
  return (await answered.json() as { passType: { showIds: string[] } }).passType.showIds
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

  // `standings` counts the whole filtered set, which is what the heading's line states: the page
  // of rows in hand cannot answer it (D-132 criterion 3).
  test('a list endpoint answers with an envelope, never a bare array', async () => {
    const envelope = await (await send('GET', '/api/admin/shows?page=1&pageSize=2')).json() as Record<string, unknown>
    expect(Object.keys(envelope).sort()).toEqual(['items', 'page', 'pageSize', 'pages', 'standings', 'total'])
    expect(Object.keys(envelope.standings as object).sort()).toEqual(['drafts', 'onSale'])
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
      durationMinutes: 120,
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
        durationMinutes: 120,
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
      durationMinutes: 120,
      doorsAt: nextWeek(1),
    })
    expect(answered.status).toBe(400)
  })
})

// Every shift's window ends from the running time, so one left empty at a venue we run strands
// the whole rota at curtain plus the offset (0078).
describe.skipIf(skip !== null)('a performance at a venue we run carries its running time (D-121 criterion 6)', () => {
  test('adding one without it is refused, naming the venue, and nothing is written', async () => {
    const id = await newShow()
    const answered = await send('POST', `/api/admin/shows/${id}/performances`, { venueId, startsAt: nextWeek() })
    expect(answered.status).toBe(400)
    const says = await answered.text()
    expect(says).toContain('running time')
    expect(says).toContain('The Test House')
    expect((await detail(id)).performances).toHaveLength(0)
  })

  test('an external venue may leave it empty', async () => {
    const id = await newShow()
    const answered = await send('POST', `/api/admin/shows/${id}/performances`, { venueId: venue({ isExternal: true }), startsAt: nextWeek() })
    expect(answered.status).toBe(200)
  })

  test('saving one without it is refused, and saving one with it clears the checklist and the list', async () => {
    const id = await newShow()
    const performance = importedPerformance(id)
    expect((await detail(id)).show.untimedPerformanceCount).toBe(1)

    const listed = await send('GET', '/api/admin/shows?untimed=true&pageSize=100')
    expect((await listed.json() as { items: { id: string }[] }).items.map(one => one.id)).toContain(id)

    const refused = await send('PUT', `/api/admin/performances/${performance}`, { venueId, startsAt: nextWeek() })
    expect(refused.status).toBe(400)
    expect(await refused.text()).toContain('running time')

    const saved = await send('PUT', `/api/admin/performances/${performance}`, { venueId, startsAt: nextWeek(), durationMinutes: 150 })
    expect(saved.status).toBe(200)
    expect((await detail(id)).show.untimedPerformanceCount).toBe(0)
  })

  test('a cancelled performance may be saved without it', async () => {
    const id = await newShow()
    const performance = importedPerformance(id)
    expect((await send('POST', `/api/admin/performances/${performance}/cancel`)).status).toBe(200)

    const saved = await send('PUT', `/api/admin/performances/${performance}`, { venueId, startsAt: nextWeek(), notes: 'Called off' })
    expect(saved.status).toBe(200)
  })
})

describe.skipIf(skip !== null)('a performance may hand its ticketing to an external provider (D-122)', () => {
  test('setting the URL is recorded with its old and new value', async () => {
    const id = await newShow()
    const performance = await addPerformance(id)

    expect((await send('PUT', `/api/admin/performances/${performance}`, {
      venueId,
      startsAt: nextWeek(),
      durationMinutes: 120,
      externalBookingUrl: 'https://tickets.example.org/seagull',
    })).status).toBe(200)

    expect((await detail(id)).performances.find(one => one.id === performance)?.externalBookingUrl)
      .toBe('https://tickets.example.org/seagull')

    const entry = trail<{ detail: { changes: { externalBookingUrl: { from: null, to: string } } } }>(
      'performance.updated',
      `performance:${performance}`,
    )
    expect(entry?.detail.changes.externalBookingUrl).toEqual({ from: null, to: 'https://tickets.example.org/seagull' })
  })

  // Criterion 1: an internal path this story does not itself build (D-104, D-114, D-124) is
  // covered by its own suite; the desk sale path exists today and is proved here.
  test('the desk cannot put an externally ticketed performance on sale, and the link is quoted', async () => {
    const id = await newShow()
    const performance = await addPerformance(id, { externalBookingUrl: 'https://tickets.example.org/seagull' })

    const answered = await send('POST', `/api/admin/performances/${performance}/sale`, { onSale: true })
    expect(answered.status).toBe(409)
    expect(await answered.text()).toContain('https://tickets.example.org/seagull')
  })

  // Criterion 3: clearing it is only ever a configuration change, never a sale.
  test('clearing the URL does not put the performance back on sale', async () => {
    const id = await newShow()
    const performance = await addPerformance(id, { externalBookingUrl: 'https://tickets.example.org/seagull' })

    expect((await send('PUT', `/api/admin/performances/${performance}`, {
      venueId,
      startsAt: nextWeek(),
      durationMinutes: 120,
      externalBookingUrl: null,
    })).status).toBe(200)

    const found = (await detail(id)).performances.find(one => one.id === performance)
    expect(found?.externalBookingUrl).toBeNull()
    expect(found?.status).toBe('DRAFT')

    const onSale = await send('POST', `/api/admin/performances/${performance}/sale`, { onSale: true })
    expect(onSale.status).toBe(200)
  })

  test('text that is not a URL is refused', async () => {
    const id = await newShow()
    const performance = await addPerformance(id)

    const answered = await send('PUT', `/api/admin/performances/${performance}`, {
      venueId,
      startsAt: nextWeek(),
      durationMinutes: 120,
      externalBookingUrl: 'the box office',
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

  // D-132 criterion 3, from the committee's `admin-shows` mockup: a row states the run, the venue,
  // where the show stands and how much of the house is reserved, each in words as well as colour.
  test('a row states its run, its venue, where it stands and what is reserved', async () => {
    const title = named('A full row')
    const id = await newShow({ title })
    await addPerformance(id, { startsAt: nextWeek() })
    await addPerformance(id, { startsAt: nextWeek(48) })
    expect((await send('POST', `/api/admin/shows/${id}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

    const { show } = await detail(id)
    const view = await signedIn()
    await visit(view, `${app.baseURL}/box-office/shows`, '[data-test="shows-table"]')
    await waitFor(view, `document.querySelector('[data-test="shows-table"]').textContent.includes(${JSON.stringify(title)})`)

    const rows = await textOf(view, '[data-test="shows-table"]')
    expect(rows).toContain('The Test House')
    expect(rows).toContain(`0 of ${show.capacity} seats`)
    expect(await textOf(view, `[data-test="standing-${id}"]`)).toBe('On sale')
    view.close()
  }, 120_000)

  // The line under the heading counts the whole filtered set, so it cannot be answered from the
  // page of rows in hand: a second page of drafts would make the figures lie.
  test('the heading counts every show the filter describes, not the page of rows', async () => {
    await newShow({ title: named('Counted') })

    const view = await signedIn()
    await visit(view, `${app.baseURL}/box-office/shows`, '[data-test="shows-season-line"]')
    const line = await textOf(view, '[data-test="shows-season-line"]')
    expect(line.startsWith('Every season:')).toBe(true)

    const listed = await (await send('GET', '/api/admin/shows?page=1&pageSize=1')).json() as {
      total: number
      standings: { onSale: number, drafts: number }
    }
    expect(line).toContain(`${listed.total} show`)
    expect(line).toContain(`${listed.standings.onSale} on sale`)
    expect(line).toContain(`${listed.standings.drafts} draft`)
    view.close()
  }, 120_000)

  // A draft with no artwork is named on the one page that can do something about it (D-132
  // criterion 6): the public frame draws its gradient until a poster exists.
  test('drafts with no poster are named on the list', async () => {
    const title = named('No artwork')
    await newShow({ title })

    const view = await signedIn()
    await visit(view, `${app.baseURL}/box-office/shows`, '[data-test="shows-artless"]')
    expect(await textOf(view, '[data-test="shows-artless"]')).toContain('with no poster')
    view.close()
  }, 120_000)

  test('the box office officer sees a show, its state and its performances', async () => {
    const title = named('On screen')
    const id = await newShow({ title })
    await addPerformance(id)

    const view = await signedIn()

    // The console shell renders no <main>, so the screen names an element of its own.
    await visit(view, `${app.baseURL}/box-office/shows`, '[data-test="shows-table"]')
    expect(await textOf(view, '[data-test="shows-table"]')).toContain(title)

    // The builder's operator and value are chosen from real dropdowns, the condition becomes a
    // chip, and the URL carries it (K-129 criteria 3 and 4).
    await click(view, '[data-test="toolbar-filters"]')
    await waitFor(view, `document.querySelector('[data-test="filter-status-operator"]')`)
    await pickOption(view, '[data-test="filter-status-operator"]', 'Is')
    await waitFor(view, `document.querySelector('[data-test="filter-status-value"]')`)
    await pickOption(view, '[data-test="filter-status-value"]', 'Draft')
    await waitFor(view, `document.querySelector('[data-test="toolbar-active"]')?.innerText.includes('Status is Draft')`)
    await waitFor(view, `new URLSearchParams(location.search).get('status') === 'is:DRAFT'`)
    expect(await textOf(view, '[data-test="shows-table"]')).toContain(title)

    await visit(view, `${app.baseURL}/box-office/shows/${id}?tab=performances`, '[data-test="performances-table"]')
    expect(await textOf(view, '[data-test="show-status"]')).toContain('Draft')
    expect(await textOf(view, '[data-test="performances-table"]')).toContain('Closes at curtain-up')
    view.close()
  }, 120_000)

  // The screen holds a day and a wall clock and the request holds an instant, so the form's own
  // schema has to be the screen's or the button submits nothing and says nothing.
  test('adding a performance from the screen puts it on the table', async () => {
    const id = await newShow({ title: named('Added on screen') })
    const view = await signedIn()
    await visit(view, `${app.baseURL}/box-office/shows/${id}?tab=performances`, '[data-test="performances-table"]')

    await click(view, '[data-test="add-performance"]')
    await waitFor(view, `document.querySelector('[data-test="performance-form"]')`)
    await fillDate(view, '[data-test="performance-day"]', '2027-03-04')
    await fillTime(view, '[data-test="performance-clock"]', '20:15')
    await fillNumber(view, '[data-test="performance-duration"]', '135')
    await click(view, '[data-test="performance-submit"]')

    await waitFor(view, `document.querySelector('[data-test="performances-table"]').textContent.includes('4 Mar 2027')`)
    expect(await textOf(view, '[data-test="performances-table"]')).toContain('20:15')
    expect((await detail(id)).performances.length).toBe(1)
    view.close()
  }, 120_000)

  // D-121 criterion 6: the row and the checklist both say so, on the screen that can put it right.
  test('a performance missing its running time is named on its row and on the checklist', async () => {
    const id = await newShow({ title: named('Untimed') })
    importedPerformance(id)

    const view = await signedIn()
    await visit(view, `${app.baseURL}/box-office/shows/${id}?tab=performances`, '[data-test="performances-table"]')
    expect(await textOf(view, '[data-test="performances-table"]')).toContain('No running time')
    expect(await textOf(view, '[data-test="check-running-time"]')).toContain('Running time set for every performance: not yet')
    view.close()
  }, 120_000)

  // Criterion 2: an externally ticketed performance states so plainly rather than showing a
  // house figure or a nought that reads as nobody has bought a ticket.
  test('an externally ticketed performance names itself rather than a capacity or a sold figure', async () => {
    const id = await newShow({ title: named('Sold elsewhere') })
    await addPerformance(id, { externalBookingUrl: 'https://tickets.example.org/seagull' })

    const view = await signedIn()
    await visit(view, `${app.baseURL}/box-office/shows/${id}?tab=performances`, '[data-test="performances-table"]')

    const text = await textOf(view, '[data-test="performances-table"]')
    expect(text).toContain('Externally ticketed')
    expect(text).toContain('n/a')
    view.close()
  }, 120_000)

  test('setting and clearing the link from the screen', async () => {
    const id = await newShow({ title: named('Link out') })
    await addPerformance(id)

    const view = await signedIn()
    await visit(view, `${app.baseURL}/box-office/shows/${id}?tab=performances`, '[data-test="performances-table"]')

    await click(view, '[data-test^="edit-performance-"]')
    await waitFor(view, `document.querySelector('[data-test="performance-form"]')`)
    await fill(view, '[data-test="performance-external-url"]', 'https://tickets.example.org/seagull')
    await click(view, '[data-test="performance-submit"]')

    await waitFor(view, `document.querySelector('[data-test="performances-table"]').textContent.includes('Externally ticketed')`)
    view.close()
  }, 120_000)

  // Issue 1323: the sheet names each pass on sale for the show's dates, ticked for an in-house show.
  test('the publish sheet lists a pass on sale for the show\'s dates, ticked, and publishing covers the show', async () => {
    const id = await newShow({ title: named('Covered on screen') })
    await addPerformance(id)
    const pass = await passOnSale()

    const view = await signedIn()
    await visit(view, `${app.baseURL}/box-office/shows/${id}`, '[data-test="publish"]')
    expect(await textOf(view, '[data-test="check-passes"]')).toContain('Covered by every pass on sale for its dates: not yet')
    await click(view, '[data-test="publish"]')
    await waitFor(view, `document.querySelector('[data-test="cover-pass-${pass.id}"]')`)
    expect(await textOf(view, '[data-test="publish-passes"]')).toContain(pass.name)
    expect(await view.evaluate<boolean>(`document.querySelector('[data-test="cover-pass-${pass.id}"] [role="checkbox"]')?.getAttribute('aria-checked') === 'true'`)).toBe(true)

    await click(view, '[data-test="confirm-publish"]')
    await waitFor(view, `document.querySelector('[data-test="show-status"]')?.textContent.includes('Published')`)
    expect(await coveredShows(pass.id)).toContain(id)
    view.close()
  }, 120_000)
})

// Issue 1323, D-123 criterion 4: the cover is chosen where the show goes on sale, by the same
// additive action as the pass's own Covered shows, and never removes one.
describe.skipIf(skip !== null)('publishing may add the show to the passes on sale for its dates (issue 1323)', () => {
  test('the show\'s detail names each pass on sale for its dates and whether it covers the show', async () => {
    const id = await newShow()
    await addPerformance(id)
    const pass = await passOnSale()

    const answered = await send('GET', `/api/admin/shows/${id}`)
    const { coveringPasses } = await answered.json() as { coveringPasses: { id: string, name: string, covered: boolean }[] }
    expect(coveringPasses.find(one => one.id === pass.id)).toEqual({ id: pass.id, name: pass.name, covered: false })
  })

  test('publishing with a pass ticked adds the show to it, audited as the pass\'s own action', async () => {
    const id = await newShow()
    await addPerformance(id)
    const pass = await passOnSale()

    const published = await send('POST', `/api/admin/shows/${id}/publish`, { published: true, coverPassTypeIds: [pass.id] })
    expect(published.status).toBe(200)
    expect(await coveredShows(pass.id)).toContain(id)
    expect(trail<{ detail: { added: string[], removed: string[] } }>('pass-type.shows.updated', `pass-type:${pass.id}`)?.detail)
      .toEqual({ added: [id], removed: [] })
  })

  test('a pass not on sale for the show\'s dates is refused, and nothing is published or covered', async () => {
    const id = await newShow()
    await addPerformance(id)
    const pass = await passOnSale({ status: 'DRAFT' })

    const refused = await send('POST', `/api/admin/shows/${id}/publish`, { published: true, coverPassTypeIds: [pass.id] })
    expect(refused.status).toBe(409)
    expect(await refused.text()).toContain(pass.name)
    expect((await detail(id)).show.status).toBe('DRAFT')
    expect(await coveredShows(pass.id)).not.toContain(id)
  })

  test('a pass already covering the show is left as it is', async () => {
    const id = await newShow()
    await addPerformance(id)
    const pass = await passOnSale({ covering: id })

    const published = await send('POST', `/api/admin/shows/${id}/publish`, { published: true, coverPassTypeIds: [pass.id] })
    expect(published.status).toBe(200)
    expect((await coveredShows(pass.id)).filter(one => one === id)).toHaveLength(1)
  })
})

// J-111 criterion 8: the booking form names what is being booked, so it never has to fetch the
// show again. Allow-listed, like every other public payload (D-121 criterion 1).
describe.skipIf(skip !== null)('the booking form is told what it is booking (J-111)', () => {
  test('the payload names the show and the performance, and carries nothing else about them', async () => {
    const id = await newShow({ title: `A Midsummer Night's Dream ${crypto.randomUUID().slice(0, 8)}` })
    const performanceId = await addPerformance(id)
    expect((await send('POST', `/api/admin/shows/${id}/publish`, { published: true, cascadePerformances: true })).status).toBe(200)

    const answered = await send('GET', `/api/performances/${performanceId}/booking`, undefined, '')
    expect(answered.status).toBe(200)
    const payload = await answered.json() as {
      show: Record<string, unknown>
      performance: Record<string, unknown>
    }

    expect(Object.keys(payload.show).sort()).toEqual(['slug', 'title'])
    expect(Object.keys(payload.performance).sort()).toEqual(['startsAt', 'venueName'])
  }, 120_000)
})
