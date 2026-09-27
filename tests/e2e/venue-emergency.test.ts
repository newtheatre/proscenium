import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { testVenue, tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// E-113 through the real routes. The append-only guard and the versioning are pinned in
// `tests/integration/venue-emergency.test.ts`; this is the wiring and the tonight-facing read.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let admin: TestMember
let foh: TestMember
let house: { venueId: string, performanceId: string }

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  admin = await adminSession(app)
  foh = await registerMember(app, 'emergency-foh', generatePassword())
  await request(app, 'POST', '/api/admin/roles', { userId: foh.id, role: 'FOH_MANAGER' }, admin.cookie)

  const database = new Database(app.databaseFile)
  try {
    const made = tonightsPerformance(sqliteTarget(database), { suffix: 'emergency-house' })
    house = { venueId: made.venueId, performanceId: made.performanceId }
  }
  finally {
    database.close()
  }
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

const send = (method: string, path: string, body?: unknown, as = admin.cookie): Promise<Response> =>
  request(app, method, path, body, as)

interface TonightCard {
  venueId: string
  venueName: string
  address: string | null
  assemblyPoint: string | null
  firePanel: string | null
  firstAiders: string | null
  firstAidersTonight: { firstName: string, roles: string[] }[] | null
  firstCallName: string | null
  firstCallPhone: string | null
  dutyManagers: { name: string, phone: string }[] | null
}

async function cardAt(as: string, venueId: string): Promise<TonightCard | undefined> {
  const answered = await send('GET', '/api/tonight/emergency', undefined, as)
  expect(answered.status).toBe(200)
  const { cards } = await answered.json() as { cards: TonightCard[] }
  return cards.find(card => card.venueId === venueId)
}

function write(statement: string, ...parameters: unknown[]): void {
  const database = new Database(app.databaseFile)
  try {
    database.query(statement).run(...parameters as never[])
  }
  finally {
    database.close()
  }
}

describe.skipIf(skip !== null)('committee configuration (E-113 criterion 1)', () => {
  test('an officer can file a version and read it back', async () => {
    const saved = await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, {
      address: 'The Nottingham New Theatre, Cherry Tree Hill, University Park, Nottingham NG7 2RD',
      assemblyPoint: 'The car park behind the building',
      exits: 'Two, both stage left',
      firstAidKit: 'Behind the bar',
      defibrillator: 'Foyer wall by the box office',
      firePanel: 'Foyer, left of the main doors',
    })
    expect(saved.status).toBe(200)

    const listed = await send('GET', '/api/admin/venues/emergency')
    const { venues } = await listed.json() as { venues: { venueId: string, assemblyPoint: string | null }[] }
    expect(venues.find(venue => venue.venueId === house.venueId)?.assemblyPoint).toBe('The car park behind the building')
  })

  test('an ordinary member cannot', async () => {
    const member = await registerMember(app, 'emergency-nobody', generatePassword())
    expect((await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { address: 'x', assemblyPoint: 'x' }, member.cookie)).status).toBe(403)
  })

  test('a second version supersedes without editing the first', async () => {
    await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { address: 'The Nottingham New Theatre, Cherry Tree Hill, University Park, Nottingham NG7 2RD', assemblyPoint: 'First version' })
    await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { address: 'The Nottingham New Theatre, Cherry Tree Hill, University Park, Nottingham NG7 2RD', assemblyPoint: 'Second version' })

    const listed = await send('GET', '/api/admin/venues/emergency')
    const { venues } = await listed.json() as { venues: { venueId: string, assemblyPoint: string | null }[] }
    expect(venues.find(venue => venue.venueId === house.venueId)?.assemblyPoint).toBe('Second version')
  })

  test('editing a missing venue 404s', async () => {
    expect((await send('PUT', '/api/admin/venues/no-such-venue/emergency', { address: 'x', assemblyPoint: 'x' })).status).toBe(404)
  })

  // Issue 1352: a venue with no card yet offers its address for audiences to prefill the card.
  test('the overview carries each venue\'s address for audiences beside its card\'s own', async () => {
    const database = new Database(app.databaseFile)
    const bare = 'venue-emergency-bare'
    try {
      testVenue(sqliteTarget(database), { suffix: 'emergency-bare' })
      database.run('UPDATE venues SET address = ? WHERE id = ?', ['University Park, Nottingham NG7 2RD', bare])
    }
    finally {
      database.close()
    }

    const listed = await send('GET', '/api/admin/venues/emergency')
    const { venues } = await listed.json() as { venues: { venueId: string, address: string | null, venueAddress: string | null }[] }
    expect(venues.find(venue => venue.venueId === bare)).toMatchObject({ address: null, venueAddress: 'University Park, Nottingham NG7 2RD' })
  })

  // Issue 902: the address is the one line a volunteer reads aloud, so a card cannot be filed
  // without it.
  test('a card with no address is refused', async () => {
    expect((await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { assemblyPoint: 'No address here' })).status).toBe(400)
  })
})

describe.skipIf(skip !== null)('reading tonight\'s card (E-113 criteria 2, 4)', () => {
  test('a shift authority reads the current card for their own venue', async () => {
    await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, {
      address: 'The Nottingham New Theatre, Cherry Tree Hill, University Park, Nottingham NG7 2RD',
      assemblyPoint: 'Reading test',
      firstAidKit: 'Behind the bar',
      defibrillator: 'Foyer wall by the box office',
      firePanel: 'Foyer, left of the main doors',
    })

    const card = await cardAt(foh.cookie, house.venueId)
    expect(card?.assemblyPoint).toBe('Reading test')
    expect(card?.address).toContain('NG7 2RD')
    expect(card?.firePanel).toBe('Foyer, left of the main doors')
    expect(card?.venueName.length).toBeGreaterThan(0)
    expect(card?.dutyManagers).toEqual([])
  })

  // Issue 903: the first-ever visit with no connectivity has to carry the address, so the server
  // render is what this reads, never the hydrated page.
  test('the served HTML already carries the address, before any JavaScript runs', async () => {
    await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { address: 'The Nottingham New Theatre, Cherry Tree Hill, University Park, Nottingham NG7 2RD', assemblyPoint: 'Served' })

    const page = await send('GET', '/tonight/emergency', undefined, foh.cookie)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Cherry Tree Hill')
  })

  // Issue 1310: the building's card is for whoever is holding the phone; only the duty manager's
  // number stays with tonight's team (A-114).
  test('anyone signed in reads every venue running tonight, with no duty manager\'s number', async () => {
    const member = await registerMember(app, 'emergency-reader', generatePassword())
    const card = await cardAt(member.cookie, house.venueId)
    expect(card?.address).toContain('NG7 2RD')
    expect(card?.dutyManagers).toBeNull()
  })

  test('the served HTML carries the address to a member with no shift too', async () => {
    const member = await registerMember(app, 'emergency-served', generatePassword())
    const page = await send('GET', '/tonight/emergency', undefined, member.cookie)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Cherry Tree Hill')
  })

  test('somebody signed out is not given it, and the screen sends them to sign in', async () => {
    expect((await request(app, 'GET', '/api/tonight/emergency')).status).toBe(401)
    const page = await request(app, 'GET', '/tonight/emergency')
    expect(new URL(page.url).pathname).toBe('/sign-in')
    expect(await page.text()).not.toContain('Cherry Tree Hill')
  })

  // A cached copy keeps its numbers only for the account it was fetched for (A-114).
  test('the answer names the account it was fetched for', async () => {
    const member = await registerMember(app, 'emergency-stamped', generatePassword())
    const answered = await send('GET', '/api/tonight/emergency', undefined, member.cookie)
    expect((await answered.json() as { viewerId: string }).viewerId).toBe(member.id)
  })
})

// E-113 criterion 1 as amended by issue 1310: tonight's first aiders come off tonight's own rota,
// read against the module the committee names, and the committee's line stands in until then.
describe.skipIf(skip !== null)('tonight\'s first aiders on the card (issue 1310)', () => {
  test('unnamed, the card carries the committee\'s own line and derives nobody', async () => {
    await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, {
      address: 'The Nottingham New Theatre, Cherry Tree Hill, University Park, Nottingham NG7 2RD',
      assemblyPoint: 'First aid test',
      firstAiders: 'Ask the duty manager',
    })
    const card = await cardAt(foh.cookie, house.venueId)
    expect(card?.firstAiders).toBe('Ask the duty manager')
    expect(card?.firstAidersTonight).toBeNull()
  })

  test('named, a confirmed volunteer with a current record is on it by first name', async () => {
    const department = `SAF${crypto.randomUUID().slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`
    expect((await send('POST', '/api/admin/training/departments', { code: department, name: 'First aid' })).status).toBe(200)
    const moduleId = `${department}-101`
    expect((await send('POST', '/api/admin/training/modules', {
      id: moduleId, department, kind: 'MODULE', name: 'Emergency first aid at work', status: 'ACTIVE',
    })).status).toBe(200)
    expect((await send('PUT', '/api/admin/config/FIRST_AID_MODULE', { value: moduleId })).status).toBe(200)

    const aider = await registerMember(app, 'emergency-aider', generatePassword())
    write('INSERT INTO training_records (id, user_id, module_id, awarded_on, source) VALUES (?, ?, ?, ?, \'SIGNOFF\')',
      `tr-${aider.id}`, aider.id, moduleId, '2026-01-10')
    write('INSERT INTO shifts (id, performance_id, role, slot, user_id, status) VALUES (?, ?, \'BAR\', 1, ?, \'CONFIRMED\')',
      `${house.performanceId}-aider`, house.performanceId, aider.id)

    const member = await registerMember(app, 'emergency-looker', generatePassword())
    const card = await cardAt(member.cookie, house.venueId)
    expect(card?.firstAidersTonight).toEqual([{ firstName: aider.name.split(' ')[0]!, roles: ['BAR'] }])
  })
})

// Issue 1519: at a campus venue estates security is rung first, and no emergency call dials on
// the first tap. 999 stays on the screen for every venue.
describe.skipIf(skip !== null)('who to ring first (issue 1519)', () => {
  const address = 'The Nottingham New Theatre, Cherry Tree Hill, University Park, Nottingham NG7 2RD'
  const security = { firstCallName: 'University Security', firstCallPhone: '0115 951 8888' }

  test('a card files who to ring first, and a name with no number is refused', async () => {
    const path = `/api/admin/venues/${house.venueId}/emergency`
    expect((await send('PUT', path, { address, firstCallName: 'University Security' })).status).toBe(400)
    expect((await send('PUT', path, { address, firstCallPhone: '0115 951 8888' })).status).toBe(400)
    expect((await send('PUT', path, { address, assemblyPoint: 'Campus', ...security })).status).toBe(200)

    const card = await cardAt(foh.cookie, house.venueId)
    expect(card).toMatchObject(security)
  })

  // Served as links, so a phone that never runs the script can still ring; the sheet is the
  // hydrated screen's (0106).
  test('the served screen reads to security and offers 999 too, each as a link that works unscripted', async () => {
    await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { address, ...security })

    const page = await send('GET', '/tonight/emergency', undefined, foh.cookie)
    const html = await page.text()
    expect(html).toContain('Read to University Security')
    expect(html).toContain('Call University Security')
    expect(html).toContain('Call 999')
    expect(html).toContain('href="tel:01159518888"')
    expect(html).toContain('href="tel:999"')
  })

  test('a card that names nobody reads to 999, as it always has', async () => {
    await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { address })

    const card = await cardAt(foh.cookie, house.venueId)
    expect(card).toMatchObject({ firstCallName: null, firstCallPhone: null })
    const html = await (await send('GET', '/tonight/emergency', undefined, foh.cookie)).text()
    expect(html).toContain('Read to 999')
    expect(html).not.toContain('Call University Security')
  })

  test('a tap opens a sheet naming the number, and only the sheet\'s own button dials it', async () => {
    await send('PUT', `/api/admin/venues/${house.venueId}/emergency`, { address, ...security })
    const password = generatePassword()
    const reader = await registerMember(app, 'emergency-caller', password)

    const view = await openSignedOutView(app.baseURL, { width: 360, height: 740 })
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', reader.email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)

      await visit(view, `${app.baseURL}/tonight/emergency`, '[data-test="emergency-call-01159518888"]')
      await click(view, '[data-test="emergency-call-01159518888"]')
      await waitFor(view, `document.querySelector('[data-test="emergency-call-now"]')`)
      expect(new URL(await view.evaluate<string>('location.href')).pathname).toBe('/tonight/emergency')
      expect(await view.evaluate<string>(`document.querySelector('[data-test="emergency-call-now"]').getAttribute('href')`)).toBe('tel:01159518888')
      expect(await textOf(view, '[role="dialog"]')).toContain('0115 951 8888')

      await click(view, '[data-sheet-back]')
      await waitFor(view, `!document.querySelector('[data-test="emergency-call-now"]')`)
      await click(view, '[data-test="emergency-call-999"]')
      await waitFor(view, `document.querySelector('[data-test="emergency-call-now"]')?.getAttribute('href') === 'tel:999'`)
    }
    finally {
      view.close()
    }
  }, 120_000)
})
