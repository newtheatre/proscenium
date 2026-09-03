import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { adminSession, registerMember } from '#tests/helpers/accounts'
import { testVenue } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// D-101 and D-102 through the real routes and the real pages. What the states mean and what the
// queries return are pinned in the unit and integration suites.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000

let app: AppUnderTest
let officer: TestMember
let member: TestMember
let venueId: string

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
  member = await registerMember(app, 'ordinary', generatePassword())
  venueId = venue(40)
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
function venue(capacity: number | null): string {
  const database = new Database(app.databaseFile)
  try {
    return testVenue({
      batch: statements => database.transaction(() => {
        for (const [statement, ...parameters] of statements) database.prepare(statement).run(...parameters as never[])
      })(),
    }, { suffix: crypto.randomUUID().slice(0, 8), capacity }).id
  }
  finally {
    database.close()
  }
}

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`
const slugged = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, '-')

// A week out, so a window of any sensible length is still open when the test asks.
const nextWeek = (offsetHours = 0): number => Math.floor(Date.now() / 1000) + 7 * 86_400 + offsetHours * 3600

interface PublicPerformance {
  id: string
  startsAt: number
  durationMinutes: number | null
  intervalCount: number
  intervalMinutes: number | null
  venueName: string
  externalBookingUrl: string | null
  bookingClosesAt: number
  cancelled: boolean
  availability: string
  remaining: number | null
  says: string
  prices: { name: string, description: string | null, price: number }[]
}

interface PublicShow {
  show: { slug: string, title: string, ageGuidance: string | null, latecomerPolicy: string | null }
  categoryName: string | null
  assessment: string
  warnings: { slug: string, title: string, kind: string, level: string | null }[]
  performances: PublicPerformance[]
}

async function newShow(over: Record<string, unknown> = {}): Promise<{ id: string, slug: string }> {
  const title = String(over.title ?? named('The Seagull'))
  const slug = slugged(title)
  const answered = await send('POST', '/api/admin/shows', { title, slug, ...over })
  expect(answered.status).toBe(200)
  return { id: (await answered.json() as { id: string }).id, slug }
}

async function addPerformance(showId: string, over: Record<string, unknown> = {}): Promise<string> {
  const answered = await send('POST', `/api/admin/shows/${showId}/performances`, {
    venueId,
    startsAt: nextWeek(),
    durationMinutes: 120,
    intervalCount: 1,
    intervalMinutes: 15,
    ...over,
  })
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

async function publish(showId: string): Promise<void> {
  const answered = await send('POST', `/api/admin/shows/${showId}/publish`, { published: true, cascadePerformances: true })
  expect(answered.status).toBe(200)
}

// A show on the public site with one performance a week out, which is the shape most cases want.
async function publishedShow(show: Record<string, unknown> = {}, performance: Record<string, unknown> = {}): Promise<{
  id: string
  slug: string
  performanceId: string
}> {
  const created = await newShow(show)
  const performanceId = await addPerformance(created.id, performance)
  await publish(created.id)
  return { ...created, performanceId }
}

async function publicShow(slug: string): Promise<PublicShow> {
  const answered = await send('GET', `/api/shows/${slug}`, undefined, '')
  expect(answered.status).toBe(200)
  return await answered.json() as PublicShow
}

async function listing(): Promise<{ items: PublicShow[], total: number }> {
  const answered = await send('GET', '/api/whats-on?pageSize=100', undefined, '')
  expect(answered.status).toBe(200)
  return await answered.json() as { items: PublicShow[], total: number }
}

async function addWarning(over: Record<string, unknown> = {}): Promise<string> {
  const title = String(over.title ?? named('Death'))
  const answered = await send('POST', '/api/admin/content-warnings', {
    title, slug: slugged(title), kind: 'GENERAL', ...over,
  })
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

describe.skipIf(skip !== null)('the listing answers without an account, and only for what is on (D-101 criterion 1)', () => {
  test('a published show with a future on-sale performance is listed', async () => {
    const show = await publishedShow()
    expect((await listing()).items.map(item => item.show.slug)).toContain(show.slug)
  })

  test('a draft show is absent from the listing and 404s on its public address', async () => {
    const created = await newShow()
    await addPerformance(created.id)

    expect((await listing()).items.map(item => item.show.slug)).not.toContain(created.slug)
    expect((await send('GET', `/api/shows/${created.slug}`, undefined, '')).status).toBe(404)
  })

  test('an address nobody holds answers the same way a draft one does', async () => {
    expect((await send('GET', '/api/shows/no-such-show-at-all', undefined, '')).status).toBe(404)
  })

  test('the listing is an envelope, never a bare array', async () => {
    const answered = await (await send('GET', '/api/whats-on?page=1&pageSize=2', undefined, '')).json() as Record<string, unknown>
    expect(Object.keys(answered).sort())
      .toEqual(['cacheMaxSeconds', 'cacheSeconds', 'items', 'page', 'pageSize', 'pages', 'total'])
  })
})

describe.skipIf(skip !== null)('every performance states its availability, computed server-side (D-101 criterion 2)', () => {
  test('a house with seats left is available', async () => {
    const show = await publishedShow()
    const [performance] = (await publicShow(show.slug)).performances
    expect(performance?.availability).toBe('AVAILABLE')
    expect(performance?.says).toBe('Tickets available')
  })

  test('a closed house is sold out and offers no booking button', async () => {
    const show = await publishedShow({}, { capacityOverride: 0 })
    const [performance] = (await publicShow(show.slug)).performances
    expect(performance?.availability).toBe('SOLD_OUT')
    expect(performance?.says).toBe('Sold out')
  })

  // An exact unsold count on every performance is this theatre's sales, readable by anybody, so
  // the figure is carried only where the visitor is told it.
  test('the seats left are stated only while availability is limited', async () => {
    const show = await publishedShow()
    const [performance] = (await publicShow(show.slug)).performances
    expect(performance?.availability).toBe('AVAILABLE')
    expect(performance?.remaining).toBeNull()
  })

  test('a cancelled performance stays visible so a ticket holder is told', async () => {
    const show = await publishedShow()
    expect((await send('POST', `/api/admin/performances/${show.performanceId}/cancel`)).status).toBe(200)

    const [performance] = (await publicShow(show.slug)).performances
    expect(performance?.cancelled).toBe(true)
    expect(performance?.availability).toBe('BOOKING_CLOSED')
  })

  // D-112 criterion 2 refuses a sale past the window; criterion 4 is that the listing says so.
  test('a performance past its window reads booking closed', async () => {
    const created = await newShow()
    const performanceId = await addPerformance(created.id, { startsAt: Math.floor(Date.now() / 1000) + 3600 })
    expect((await send('PUT', `/api/admin/performances/${performanceId}`, {
      venueId,
      startsAt: Math.floor(Date.now() / 1000) + 3600,
      bookingClosesHoursBefore: 24,
    })).status).toBe(200)
    await publish(created.id)

    const [performance] = (await publicShow(created.slug)).performances
    expect(performance?.availability).toBe('BOOKING_CLOSED')
    expect(performance?.says).toBe('Booking closed')
  })
})

describe.skipIf(skip !== null)('the listing is cacheable and still tells the truth (D-101 criterion 3, D-112 criterion 4)', () => {
  test('the response is publicly cacheable', async () => {
    await publishedShow()
    const answered = await send('GET', '/api/whats-on', undefined, '')
    expect(answered.headers.get('cache-control')).toMatch(/^public, max-age=\d+, s-maxage=\d+$/)
  })

  // The cache may not outlive the earliest window it describes, or the listing would go on saying
  // a performance is bookable after it is not.
  test('a window closing shortly caps the cache at that moment', async () => {
    const created = await newShow()
    const closesIn = 90
    const startsAt = Math.floor(Date.now() / 1000) + 3600 + closesIn
    const performanceId = await addPerformance(created.id, { startsAt })
    expect((await send('PUT', `/api/admin/performances/${performanceId}`, {
      venueId, startsAt, bookingClosesHoursBefore: 1,
    })).status).toBe(200)
    await publish(created.id)

    const answered = await send('GET', '/api/whats-on?pageSize=100', undefined, '')
    const { cacheSeconds, cacheMaxSeconds } = await answered.json() as { cacheSeconds: number, cacheMaxSeconds: number }
    expect(cacheSeconds).toBeLessThan(cacheMaxSeconds)
    expect(cacheSeconds).toBeLessThanOrEqual(closesIn)
  })

  test('no internal note and no cost column reaches the public payload', async () => {
    const created = await newShow()
    const performanceId = await addPerformance(created.id)
    expect((await send('PUT', `/api/admin/performances/${performanceId}`, {
      venueId, startsAt: nextWeek(), notes: 'The fog machine leaks',
    })).status).toBe(200)
    await publish(created.id)

    const answered = await publicShow(created.slug)
    expect(JSON.stringify(answered)).not.toContain('The fog machine leaks')
    expect(Object.keys(answered.performances[0] ?? {}).sort()).toEqual([
      'availability', 'bookingClosesAt', 'cancelled', 'doorsAt', 'durationMinutes', 'externalBookingUrl',
      'id', 'intervalCount', 'intervalMinutes', 'prices', 'remaining', 'says', 'startsAt', 'venueName',
    ])
  })
})

describe.skipIf(skip !== null)('a price is the resolved chain, and access types never appear (D-101 criterion 4)', () => {
  test('the base price stands until a show or a performance overrides it', async () => {
    const name = named('Standard')
    const typeAnswered = await send('POST', '/api/admin/ticket-types', { name, price: 900 })
    expect(typeAnswered.status).toBe(200)

    const show = await publishedShow()
    const priced = (await publicShow(show.slug)).performances[0]?.prices.find(price => price.name === name)
    expect(priced?.price).toBe(900)
  })

  test('an access type is absent from every public price list', async () => {
    const name = named('Wheelchair space')
    expect((await send('POST', '/api/admin/ticket-types', { name, price: 900, accessKind: 'ACCESS' })).status).toBe(200)

    const show = await publishedShow()
    const names = (await publicShow(show.slug)).performances[0]?.prices.map(price => price.name) ?? []
    expect(names).not.toContain(name)
  })
})

describe.skipIf(skip !== null)('external ticketing links out and offers nothing internal (D-101 criterion 5)', () => {
  test('the performance carries the outbound link and refuses an internal sale', async () => {
    const created = await newShow()
    const startsAt = nextWeek()
    const performanceId = await addPerformance(created.id, { startsAt })
    const database = new Database(app.databaseFile)
    try {
      database.prepare('UPDATE performances SET external_booking_url = ? WHERE id = ?')
        .run('https://tickets.example.org/seagull', performanceId)
    }
    finally {
      database.close()
    }
    await publish(created.id)

    const [performance] = (await publicShow(created.slug)).performances
    expect(performance?.externalBookingUrl).toBe('https://tickets.example.org/seagull')
    expect(performance?.availability).toBe('BOOKING_CLOSED')
  })
})

describe.skipIf(skip !== null)('a warning comes from the vocabulary, never from prose (D-102 criterion 1)', () => {
  test('a show carries the vocabulary rows and the level it graded each at', async () => {
    const warning = await addWarning({ title: named('Death') })
    const show = await publishedShow()
    expect((await send('PUT', `/api/admin/shows/${show.id}/warnings`, {
      confirmedNone: false,
      warnings: [{ warningId: warning, level: 'DEPICTED' }],
    })).status).toBe(200)

    const answered = await publicShow(show.slug)
    expect(answered.assessment).toBe('WARNED')
    expect(answered.warnings.map(one => `${one.kind}:${one.level}`)).toEqual(['GENERAL:DEPICTED'])
  })

  test('a typed warning is refused at the write path', async () => {
    const show = await publishedShow()
    const answered = await send('PUT', `/api/admin/shows/${show.id}/warnings`, {
      confirmedNone: false,
      warnings: [{ warningId: 'anything', level: 'DEPICTED', title: 'Some upsetting scenes' }],
    })
    expect(answered.status).toBe(400)
  })

  test('a warning id nobody holds is refused', async () => {
    const show = await publishedShow()
    const answered = await send('PUT', `/api/admin/shows/${show.id}/warnings`, {
      confirmedNone: false,
      warnings: [{ warningId: 'no-such-warning', level: 'DEPICTED' }],
    })
    expect(answered.status).toBe(400)
  })

  // A level exactly when the warning is general: two tables, so SQLite cannot state it and the
  // write path holds it.
  test('a staging warning is refused a level, and a content warning is refused without one', async () => {
    const staging = await addWarning({ title: named('Strobe lighting'), kind: 'TECHNICAL' })
    const content = await addWarning({ title: named('Blood') })
    const show = await publishedShow()

    expect((await send('PUT', `/api/admin/shows/${show.id}/warnings`, {
      confirmedNone: false,
      warnings: [{ warningId: staging, level: 'DEPICTED' }],
    })).status).toBe(400)

    expect((await send('PUT', `/api/admin/shows/${show.id}/warnings`, {
      confirmedNone: false,
      warnings: [{ warningId: content, level: null }],
    })).status).toBe(400)

    expect((await send('PUT', `/api/admin/shows/${show.id}/warnings`, {
      confirmedNone: false,
      warnings: [{ warningId: staging, level: null }, { warningId: content, level: 'MENTIONED' }],
    })).status).toBe(200)
  })

  test('a vocabulary entry a show carries can only be archived, never deleted', async () => {
    const warning = await addWarning({ title: named('Loud noises') })
    const show = await publishedShow()
    expect((await send('PUT', `/api/admin/shows/${show.id}/warnings`, {
      confirmedNone: false,
      warnings: [{ warningId: warning, level: 'MENTIONED' }],
    })).status).toBe(200)

    const refused = await send('DELETE', `/api/admin/content-warnings/${warning}`)
    expect(refused.status).toBe(409)
    expect((await refused.json() as { message?: string }).message).toContain('archived')
  })

  test('an ordinary member cannot read or write the vocabulary', async () => {
    expect((await send('GET', '/api/admin/content-warnings', undefined, member.cookie)).status).toBe(403)
    expect((await send('POST', '/api/admin/content-warnings', {
      title: named('Nope'), slug: 'nope', kind: 'GENERAL',
    }, member.cookie)).status).toBe(403)
  })

  test('the vocabulary is an envelope, never a bare array', async () => {
    const answered = await (await send('GET', '/api/admin/content-warnings?page=1&pageSize=2')).json() as Record<string, unknown>
    expect(Object.keys(answered).sort()).toEqual(['items', 'page', 'pageSize', 'pages', 'total'])
  })
})

describe.skipIf(skip !== null)('confirmed clear is not the same as not yet assessed (D-102 criterion 2)', () => {
  test('a published show nobody has assessed says so, and is flagged to the committee', async () => {
    const show = await publishedShow()

    expect((await publicShow(show.slug)).assessment).toBe('NOT_ASSESSED')

    const flagged = await (await send('GET', '/api/admin/shows?unassessed=true&pageSize=100')).json() as {
      items: { id: string }[]
    }
    expect(flagged.items.map(one => one.id)).toContain(show.id)
  })

  test('confirming there is nothing to warn about is its own recorded state', async () => {
    const show = await publishedShow()
    expect((await send('PUT', `/api/admin/shows/${show.id}/warnings`, {
      confirmedNone: true, warnings: [],
    })).status).toBe(200)

    expect((await publicShow(show.slug)).assessment).toBe('CONFIRMED_NONE')

    const flagged = await (await send('GET', '/api/admin/shows?unassessed=true&pageSize=100')).json() as {
      items: { id: string }[]
    }
    expect(flagged.items.map(one => one.id)).not.toContain(show.id)
  })

  test('confirming clear while listing warnings is refused rather than half applied', async () => {
    const warning = await addWarning({ title: named('Fire') })
    const show = await publishedShow()
    const answered = await send('PUT', `/api/admin/shows/${show.id}/warnings`, {
      confirmedNone: true,
      warnings: [{ warningId: warning, level: 'MENTIONED' }],
    })
    expect(answered.status).toBe(409)
    expect((await publicShow(show.slug)).assessment).toBe('NOT_ASSESSED')
  })
})

describe.skipIf(skip !== null)('the show page carries the practical details (D-102 criterion 3)', () => {
  test('age guidance, running time, interval and latecomer policy all come back', async () => {
    const created = await newShow()
    expect((await send('PUT', `/api/admin/shows/${created.id}`, {
      title: named('The Cherry Orchard'),
      slug: created.slug,
      ageGuidance: '12 and over',
      latecomerPolicy: 'AT_INTERVAL',
    })).status).toBe(200)
    await addPerformance(created.id)
    await publish(created.id)

    const answered = await publicShow(created.slug)
    expect(answered.show.ageGuidance).toBe('12 and over')
    expect(answered.show.latecomerPolicy).toBe('AT_INTERVAL')
    expect(answered.performances[0]?.durationMinutes).toBe(120)
    expect(answered.performances[0]?.intervalCount).toBe(1)
    expect(answered.performances[0]?.intervalMinutes).toBe(15)
  })
})

describe.skipIf(skip !== null)('the pages read without an account', () => {
  test('the listing names the show and its availability', async () => {
    const title = named('The Seagull')
    const show = await publishedShow({ title })

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/whats-on`, '[data-test="whats-on-page"]')
      await waitFor(view, `document.querySelector('[data-test="show-${show.slug}"]') !== null`)
      const text = await textOf(view, `[data-test="show-${show.slug}"]`)
      expect(text).toContain(title)
      expect(text).toContain('Tickets available')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the show page says which of the three warning states it is in', async () => {
    const show = await publishedShow()

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/shows/${show.slug}`, '[data-test="show-page"]')
      await waitFor(view, `document.querySelector('[data-test="warnings-unassessed"]') !== null`)
      expect(await textOf(view, '[data-test="warnings"]')).toContain('not been assessed')

      expect((await send('PUT', `/api/admin/shows/${show.id}/warnings`, {
        confirmedNone: true, warnings: [],
      })).status).toBe(200)

      await visit(view, `${app.baseURL}/shows/${show.slug}`, '[data-test="show-page"]')
      await waitFor(view, `document.querySelector('[data-test="warnings-none"]') !== null`)
      expect(await textOf(view, '[data-test="warnings"]')).toContain('has been assessed')
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('a draft show\'s address is a 404 page, not a thin one', async () => {
    const created = await newShow()
    await addPerformance(created.id)

    const view = await openSignedOutView(app.baseURL)
    try {
      await view.navigate(`${app.baseURL}/shows/${created.slug}`)
      await waitFor(view, 'document.body.innerText.length > 0')
      expect(await textOf(view)).not.toContain(created.slug.replace(/-/g, ' '))
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

describe.skipIf(skip !== null)('the box office console administers the vocabulary', () => {
  test('a box office officer adds a warning from the screen', async () => {
    const title = named('Smoke effects')
    expect((await send('POST', '/api/admin/content-warnings', {
      title, slug: slugged(title), kind: 'TECHNICAL',
    })).status).toBe(200)

    const listed = await (await send('GET', '/api/admin/content-warnings?pageSize=100')).json() as {
      items: { title: string }[]
    }
    expect(listed.items.map(one => one.title)).toContain(title)
  })

  test('the vocabulary holds one entry per title, whatever the capitals', async () => {
    const title = named('Flashing lights')
    expect((await send('POST', '/api/admin/content-warnings', { title, slug: slugged(title), kind: 'TECHNICAL' })).status).toBe(200)
    const again = await send('POST', '/api/admin/content-warnings', {
      title: title.toUpperCase(), slug: `${slugged(title)}-again`, kind: 'TECHNICAL',
    })
    expect(again.status).toBe(409)
  })
})
