import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { sqliteTarget } from '#tests/helpers/database'
import { adminSession, registerMember, request } from '#tests/helpers/accounts'
import { tonightsPerformance } from '#tests/helpers/programme'
import { generatePassword } from '#tests/helpers/seed'
import { click, fill, fillNumber, openSignedOutView, pickOption, skipReason, startApp, textOf, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// F-127 through the real screen: one pass of /bar/products/new per shape, each ending with the
// product the till can actually sell.

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000

let app: AppUnderTest
let officer: TestMember
let barManager: TestMember
const barPassword = generatePassword()
let venueId = ''

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)

  barManager = await registerMember(app, 'setup-bar', barPassword)
  await request(app, 'POST', '/api/admin/roles', { userId: barManager.id, role: 'BAR_MANAGER' }, officer.cookie)

  const database = new Database(app.databaseFile)
  try {
    venueId = tonightsPerformance(sqliteTarget(database), { suffix: 'setup' }).venueId
  }
  finally {
    database.close()
  }
  await send('POST', '/api/till', { venueId }, barManager.cookie)
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

const named = (prefix: string): string => `${prefix} ${crypto.randomUUID().slice(0, 8)}`

const created = async (answered: Response): Promise<string> => {
  expect(answered.status).toBe(200)
  return (await answered.json() as { id: string }).id
}

const aCategory = async (name: string): Promise<string> =>
  created(await send('POST', '/api/admin/bar/categories', { name, sort: 10 }))

const anItem = async (name: string, over: Record<string, unknown> = {}): Promise<string> =>
  created(await send('POST', '/api/admin/bar/items', { name, unit: 'ML', containerMl: 700, ...over }))

interface Catalogue {
  products: { id: string, name: string, variants: { label: string, pricePence: number }[] }[]
}

async function tillSees(name: string): Promise<{ label: string, pricePence: number }[] | null> {
  const answered = await send('GET', `/api/till/products?venueId=${venueId}`, undefined, barManager.cookie)
  expect(answered.status).toBe(200)
  const listed = await answered.json() as Catalogue
  return listed.products.find(product => product.name === name)?.variants ?? null
}

async function signedInBarManager(): Promise<Bun.WebView> {
  const view = await openSignedOutView(app.baseURL)
  await visit(view, `${app.baseURL}/sign-in`)
  await fill(view, 'form input[type="email"]', barManager.email)
  await fill(view, 'form input[type="password"]', barPassword)
  await click(view, 'form button[type="submit"]')
  await waitFor(view, `document.querySelector('[data-test="account-menu"]')`)
  return view
}

describe.skipIf(skip !== null)('a can is set up in one pass (F-127 criteria 1, 4 and 5)', () => {
  test('sold as itself: one screen, one submission, on the till', async () => {
    const categoryName = named('Cans and bottles')
    await aCategory(categoryName)
    const productName = named('Cider')

    const view = await signedInBarManager()
    try {
      await visit(view, `${app.baseURL}/bar/products/new`, '[data-test="shape-cards"]')
      await click(view, '[data-test="shape-simple"]')
      await waitFor(view, `document.querySelector('[data-test="setup-form"]')`)

      await fill(view, '[data-test="setup-name"]', productName)
      await pickOption(view, '[data-test="setup-category"]', categoryName)
      await fill(view, '[data-test="setup-item-name"]', named('Cider 440ml can'))
      await fillNumber(view, '[data-test="setup-price"]', '3')

      await click(view, '[data-test="setup-submit"]')
      await waitFor(view, `location.pathname.startsWith('/bar/products/') && !location.pathname.endsWith('/new')`, 30_000)

      expect(await tillSees(productName)).toEqual([{ label: 'Can', pricePence: 300 }])
    }
    finally {
      view.close()
    }
  }, 120_000)
})

describe.skipIf(skip !== null)('a wine is set up by measure (F-127 criteria 2 and 3)', () => {
  test('sold by measure: the preset fills the sizes and one is unticked', async () => {
    const categoryName = named('Wine')
    await aCategory(categoryName)
    const productName = named('House red')

    const view = await signedInBarManager()
    try {
      await visit(view, `${app.baseURL}/bar/products/new`, '[data-test="shape-cards"]')
      await click(view, '[data-test="shape-measured"]')
      await waitFor(view, `document.querySelector('[data-test="setup-form"]')`)

      await fill(view, '[data-test="setup-name"]', productName)
      await pickOption(view, '[data-test="setup-category"]', categoryName)
      await waitFor(view, `document.querySelector('[data-test="size-125ml"]')`)

      await fill(view, '[data-test="setup-item-name"]', named('House red 750ml'))
      for (const [kind, pounds] of [['bottle', '14'], ['250ml', '5'], ['175ml', '4']] as const) {
        await fillNumber(view, `[data-test="size-price-${kind}"]`, pounds)
      }
      // The bar does not pour a 125ml glass, so the size the preset offered is unticked.
      await click(view, '[data-test="size-chosen-125ml"]')

      await click(view, '[data-test="setup-submit"]')
      await waitFor(view, `location.pathname.startsWith('/bar/products/') && !location.pathname.endsWith('/new')`, 30_000)

      const variants = await tillSees(productName)
      expect(variants?.map(variant => variant.label)).toEqual(['Bottle', '250ml', '175ml'])
      expect(variants?.map(variant => variant.pricePence)).toEqual([1400, 500, 400])
    }
    finally {
      view.close()
    }
  }, 120_000)
})

describe.skipIf(skip !== null)('a cocktail is set up from its ingredients (F-127 criterion 4)', () => {
  test('made from several things: ingredients and a choice in one submission', async () => {
    const categoryName = named('Cocktails')
    await aCategory(categoryName)
    const ginName = named('Gin')
    const vermouthName = named('Vermouth')
    const tonicName = named('Tonic')
    await anItem(ginName)
    await anItem(vermouthName)
    await anItem(tonicName, { unit: 'ITEM', containerMl: null })
    const productName = named('Negroni')

    const view = await signedInBarManager()
    try {
      await visit(view, `${app.baseURL}/bar/products/new`, '[data-test="shape-cards"]')
      await click(view, '[data-test="shape-recipe"]')
      await waitFor(view, `document.querySelector('[data-test="setup-form"]')`)

      await fill(view, '[data-test="setup-name"]', productName)
      await pickOption(view, '[data-test="setup-category"]', categoryName)

      await pickOption(view, '[data-test="component-item-0"]', ginName)
      await fillNumber(view, '[data-test="component-qty-0"]', '25')
      await click(view, '[data-test="add-component"]')
      await waitFor(view, `document.querySelector('[data-test="component-item-1"]')`)
      await pickOption(view, '[data-test="component-item-1"]', vermouthName)
      await fillNumber(view, '[data-test="component-qty-1"]', '25')

      await fillNumber(view, '[data-test="setup-recipe-price"]', '6')

      await click(view, '[data-test="setup-choice"]')
      await waitFor(view, `document.querySelector('[data-test="choice-name"]')`)
      await fill(view, '[data-test="choice-name"]', named('Garnish'))
      await pickOption(view, '[data-test="choice-item-0"]', tonicName)

      await click(view, '[data-test="setup-submit"]')
      await waitFor(view, `location.pathname.startsWith('/bar/products/') && !location.pathname.endsWith('/new')`, 30_000)

      expect(await tillSees(productName)).toEqual([{ label: 'Each', pricePence: 600 }])
      expect(await textOf(view, 'body')).toContain(ginName)
    }
    finally {
      view.close()
    }
  }, 120_000)
})

describe.skipIf(skip !== null)('a size nothing prices hides the product rather than losing the form (F-127 criteria 3 and 5)', () => {
  test('the screen says so before the submission, and the product arrives hidden', async () => {
    const categoryName = named('Snacks')
    await aCategory(categoryName)
    const productName = named('Crisps')

    const view = await signedInBarManager()
    try {
      await visit(view, `${app.baseURL}/bar/products/new`, '[data-test="shape-cards"]')
      await click(view, '[data-test="shape-simple"]')
      await waitFor(view, `document.querySelector('[data-test="setup-form"]')`)

      await fill(view, '[data-test="setup-name"]', productName)
      await pickOption(view, '[data-test="setup-category"]', categoryName)
      await fill(view, '[data-test="setup-item-name"]', named('Crisps'))

      await waitFor(view, `document.querySelector('[data-test="unpriced"]')`)
      expect(await textOf(view, '[data-test="unpriced"]')).toContain('hidden')

      await click(view, '[data-test="setup-submit"]')
      await waitFor(view, `location.pathname.startsWith('/bar/products/') && !location.pathname.endsWith('/new')`, 30_000)

      expect(await tillSees(productName)).toBe(null)
      const listed = await send('GET', `/api/admin/bar/products?search=${encodeURIComponent(productName)}`)
      const products = await listed.json() as { items: { name: string, status: string }[] }
      expect(products.items.find(product => product.name === productName)?.status).toBe('HIDDEN')
    }
    finally {
      view.close()
    }
  }, 120_000)
})
