import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { markVerified } from '#tests/helpers/accounts'
import { generatePassword, registrableAddress, syntheticPerson } from '#tests/helpers/seed'
import { click, fill, openSignedOutView, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

// K-101 criterion 1, over the screens that exist. The booking flow, the door and the till are
// named in the story and have no code yet; this list grows with them.

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
