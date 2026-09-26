import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { codeForStep, stepFor } from '#shared/utils/totp'
import { adminSession, forgetSpentStep, markVerified, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, fillPin, openSignedOutView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// K-101 criterion 1, over the screens that exist. The booking flow and the door are named in
// the story and have no code yet; this list grows with them.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let axe = ''

const password = generatePassword()

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  axe = await Bun.file('node_modules/axe-core/axe.min.js').text()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

interface Violation { id: string, impact: string, help: string, nodes: number, where: string[] }

// WCAG 2.2 AA, which is what the story asks for and what the society is held to.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// The DevTools overlay is Nuxt's own markup, injected in development and absent from a build.
// Scanning it would hold this project to somebody else's contrast.

async function violationsOn(view: Bun.WebView, path: string, marker?: string): Promise<Violation[]> {
  await visit(view, `${app.baseURL}${path}`, marker)
  return violationsHere(view)
}

// For a state reached by interaction rather than a URL (a modal, say): scans the page as it
// currently stands, with no navigation to lose it.
async function violationsHere(view: Bun.WebView): Promise<Violation[]> {
  // Injected as a script element rather than evaluated: axe is a UMD bundle, and an expression
  // is not what it is.
  await view.evaluate(`(() => {
    if (window.axe) return true
    const element = document.createElement('script')
    element.textContent = ${JSON.stringify(axe)}
    document.head.append(element)
    return Boolean(window.axe)
  })()`)
  // Parked on the window and polled for: a run started and not waited on collides with the next
  // one, which axe reports as being already running.
  await view.evaluate(`(() => {
    window.__axeResult = null
    axe.run({ exclude: [['nuxt-devtools-frame']] }, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} } })
      .then(result => {
        window.__axeResult = JSON.stringify(result.violations.map(violation => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.length,
          // The summary carries the measured ratio and the two colours, which is the difference
          // between a failing build somebody can fix and one they have to reproduce first.
          where: violation.nodes.slice(0, 3).map(node => \`\${node.target.join(' ')} :: \${(node.failureSummary ?? '').replace(/\\s+/g, ' ')}\`),
        })))
      })
      .catch(error => { window.__axeResult = JSON.stringify([{ id: 'axe-failed', help: String(error) }]) })
    return true
  })()`)
  await waitFor(view, 'window.__axeResult !== null', 60_000)

  const found = await view.evaluate<string>('window.__axeResult')
  return JSON.parse(found) as Violation[]
}

async function signedInView(): Promise<Bun.WebView> {
  const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
  const email = registrableAddress('a11y')
  await fetch(`${app.baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name: person.name, password }),
  })
  markVerified(app, email)

  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', email)
  await fill(view, 'form input[type="password"]', password)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')
  return view
}

describe.skipIf(skip !== null)('the accessibility baseline (K-101)', () => {
  const PUBLIC = [
    { name: 'the home page', path: '/', marker: 'main' },
    { name: 'the listing', path: '/whats-on', marker: '[data-test="whats-on-page"]' },
    { name: 'signing in', path: '/sign-in', marker: 'form' },
    { name: 'registering', path: '/register', marker: 'form' },
    // K-102 criterion 3: the show-night shell is dark by default and still clears AA contrast.
    // The hub is unguarded today; it moves to the signed-in cases when E-112 puts authority on it.
    { name: 'the tonight hub', path: '/tonight', marker: 'main' },
  ]

  for (const screen of PUBLIC) {
    test(`${screen.name} has no WCAG 2.2 AA violation`, async () => {
      const view = await openSignedOutView(app.baseURL)
      try {
        const violations = await violationsOn(view, screen.path, screen.marker)
        expect(violations).toEqual([])
      }
      finally {
        view.close()
      }
    }, CASE_TIMEOUT_MS)
  }

  test('the account screens have none either', async () => {
    const view = await signedInView()
    try {
      expect(await violationsOn(view, '/account/profile', '[data-test="profile-form"]')).toEqual([])
      expect(await violationsOn(view, '/account/security', '[data-test="methods"]')).toEqual([])
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // One console screen stands for the shared layout (sidebar, toolbar): issues 896 and 916.
  test('a console screen has none either', async () => {
    const email = registrableAddress('a11y-officer')
    const person = syntheticPerson(Math.floor(Math.random() * 1_000_000))
    await fetch(`${app.baseURL}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name: person.name, password }),
    })
    markVerified(app, email)

    const enrolled = await fetch(`${app.baseURL}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const cookie = (enrolled.headers.get('set-cookie') ?? '').split(';')[0]!
    const { secret } = await (await fetch(`${app.baseURL}/api/account/mfa/enrol`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
    })).json() as { secret: string }
    await fetch(`${app.baseURL}/api/account/mfa/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ code: await codeForStep(secret, stepFor(new Date())) }),
    })
    expect(Bun.spawnSync(['bun', 'scripts/grant-admin.ts', email, app.databaseFile]).exitCode).toBe(0)

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', email)
      await fill(view, 'form input[type="password"]', password)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, 'document.querySelectorAll(\'[data-test="mfa-challenge"] input\').length >= 6')

      forgetSpentStep(app, email)
      await fillPin(view, '[data-test="mfa-challenge"] input', await codeForStep(secret, stepFor(new Date())))
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')

      expect(await violationsOn(view, '/rooms/manage', '[data-test="rooms-table"]')).toEqual([])
      // K-101: raw enum values and unlabelled period fields.
      expect(await violationsOn(view, '/bar/reports', '[data-test="period-kind"]')).toEqual([])
      // K-101 criterion 5: the screens whose controls were named (issue 1151 item 11).
      expect(await violationsOn(view, '/admin/settings', '[data-test="config-search"]')).toEqual([])
      expect(await violationsOn(view, '/bar/categories', '[data-test="toolbar-search"]')).toEqual([])
      expect(await violationsOn(view, '/bar/products/new', '[data-test="shape-cards"]')).toEqual([])
      expect(await violationsOn(view, '/money/reconciliation', '[data-test="reconciliation-night"]')).toEqual([])
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // K-101 criterion 1 over the close dialogue too (F-118 criterion 3): its own fields and its
  // own tab pattern.
  test('the till has none either, mid-sale and in the close dialogue', async () => {
    const barPassword = generatePassword()
    const bar = await registerMember(app, 'a11y-till-bar', barPassword)
    const officer = await adminSession(app)
    await request(app, 'POST', '/api/admin/roles', { userId: bar.id, role: 'BAR_MANAGER' }, officer.cookie)

    const database = new Database(app.databaseFile)
    let venueId: string
    try {
      venueId = tonightsPerformance(sqliteTarget(database), { suffix: 'a11y-till' }).venueId
    }
    finally {
      database.close()
    }
    await request(app, 'POST', '/api/till', { venueId }, bar.cookie)

    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`)
      await fill(view, 'form input[type="email"]', bar.email)
      await fill(view, 'form input[type="password"]', barPassword)
      await click(view, 'form button[type="submit"]')
      await waitFor(view, 'document.querySelector(\'[data-test="account-menu"]\')')

      expect(await violationsOn(view, `/tonight/till?venueId=${venueId}`, '[data-test="till-panes"]')).toEqual([])

      await click(view, '[data-test="till-overflow-menu"]')
      await waitFor(view, `[...document.querySelectorAll('[role="menuitem"]')].some(el => el.textContent.includes('Close till'))`)
      await view.evaluate(`[...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent.includes('Close till')).click()`)
      await waitFor(view, `document.querySelector('[data-test="reader-should-show"]')`)
      expect(await violationsHere(view)).toEqual([])
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // Criterion 4 in the browser rather than in the stylesheet: a control that takes focus shows it.
  test('a focused control is visibly focused', async () => {
    const view = await openSignedOutView(app.baseURL)
    try {
      await visit(view, `${app.baseURL}/sign-in`, 'form')
      const outline = await view.evaluate<string>(`(() => {
        const field = document.querySelector('form input[type="email"]')
        field.focus()
        const style = getComputedStyle(field)
        return JSON.stringify({ width: style.outlineWidth, style: style.outlineStyle })
      })()`)

      const { width, style } = JSON.parse(outline) as { width: string, style: string }
      expect(style).not.toBe('none')
      expect(Number.parseFloat(width)).toBeGreaterThanOrEqual(2)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})
