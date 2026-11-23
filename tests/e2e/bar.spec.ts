// The bar at the till in a real browser: a product with one size is added with one press, one with
// several opens the size window, the lines sit on the till's receipt with steppers, the age check
// is asked once and its answer stays on the receipt, and a refusal of the age-restricted lines
// leaves the rest of the sale to carry on.
import { test, expect, type APIRequestContext, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (accountId: string, name: string, abilities: string[]) => ({ kind: 'person', accountId, name, assurance: 'strong', reassertedAt: Date.now(), grants: abilities.map(grant) })
const owner = person('acc_barowner', 'Bar Owner', ['core.settings.manage', 'core.modules.manage', 'payments.settings.manage', 'payments.provider.manage', 'bar.product.manage', 'bar.price.manage', 'bar.outlet.manage', 'bar.settings.manage', 'bar.allergens.manage'])
const seller = person('acc_barseller', 'Bea Seller', ['bar.sale.sell', 'payments.session.open', 'payments.attempt.attest'])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const key = () => ({ 'idempotency-key': crypto.randomUUID() })

async function post(api: APIRequestContext, url: string, data: object) {
  const response = await api.post(url, { data, headers: key() })
  expect(response.ok(), `${url}: ${await response.text()}`).toBe(true)
  return await response.json()
}

// Other browser tests share the database, so this one's products carry a name of their own.
const run = Date.now().toString(36)
const lager = `Lager ${run}`
const cola = `Cola ${run}`
const mixed = `Spirit and mixer ${run}`
const chocolate = `Chocolate bar ${run}`
let outletIds: string[] = []
let colaVariant = ''

test.beforeAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }, { key: 'core.rate-limits.write', value: 10000 }] } })
  expect((await api.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })).ok()).toBe(true)
  for (const id of ['finance', 'payments', 'bar']) expect((await api.put(`/api/core/modules/${id}`, { data: { on: true } })).ok()).toBe(true)
  await post(api, '/api/payments/providers', { provider: 'cash', label: 'Bar cash', channels: ['desk'], mode: 'live' })
  const draught = await post(api, '/api/bar/categories', { name: `Draught ${run}`, colour: 'warning' })
  const soft = await post(api, '/api/bar/categories', { name: `Soft ${run}`, colour: 'info' })
  const beer = await post(api, '/api/bar/products', { categoryId: draught.categoryId, name: lager, ageRestricted: true, variantName: 'Pint', amountMinor: 420 })
  await post(api, `/api/bar/products/${beer.productId}/variants`, { name: 'Half', amountMinor: 230 })
  const fizz = await post(api, '/api/bar/products', { categoryId: soft.categoryId, name: cola, amountMinor: 200 })
  // A drink with choices: which spirit (listed by hand, some age-restricted) and any mixer.
  await post(api, `/api/bar/products/${fizz.productId}/mixer`, { on: true })
  const spirits = await post(api, '/api/bar/choices', { name: `Spirit ${run}`, source: 'options' })
  const gin = await post(api, `/api/bar/choices/${spirits.id}/options`, { name: 'House gin', ageRestricted: true })
  await post(api, `/api/bar/choices/${spirits.id}/options`, { name: 'Premium gin', deltaMinor: 100, ageRestricted: true })
  await post(api, `/api/bar/choices/${spirits.id}/options`, { name: 'Alcohol-free gin' })
  expect((await api.patch(`/api/bar/choices/${spirits.id}`, { data: { defaultKey: gin.id }, headers: key() })).ok()).toBe(true)
  const mixers = await post(api, '/api/bar/choices', { name: `Mixer ${run}`, source: 'mixers' })
  const drink = await post(api, '/api/bar/products', { categoryId: draught.categoryId, name: mixed, variantName: 'Single', amountMinor: 450 })
  await post(api, `/api/bar/products/${drink.productId}/variants`, { name: 'Double', amountMinor: 650 })
  await post(api, `/api/bar/products/${drink.productId}/choices`, { groupIds: [spirits.id, mixers.id] })
  // A sub-category, with a product whose allergens are recorded.
  const snacks = await post(api, '/api/bar/categories', { name: `Snacks ${run}`, colour: 'success' })
  const bars = await post(api, '/api/bar/categories', { name: `Chocolate ${run}`, parentId: snacks.categoryId })
  const choc = await post(api, '/api/bar/products', { categoryId: bars.categoryId, name: chocolate, amountMinor: 130 })
  await post(api, `/api/bar/products/${choc.productId}/allergens`, { contains: ['milk'], mayContain: ['nuts'], source: 'label' })
  colaVariant = fizz.variantId
  let outlets = await (await api.get('/api/bar/outlets')).json()
  if (!outlets.outlets?.length) {
    await post(api, '/api/bar/outlets', { name: `Foyer bar ${run}`, kind: 'bar' })
    outlets = await (await api.get('/api/bar/outlets')).json()
  }
  outletIds = outlets.outlets.map((o: { id: string }) => o.id)
  await api.dispose()
})
test.use(as(seller))

async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}
async function noViolations(page: Page) {
  // A dialogue fading in is half transparent, and its contrast is judged on the half.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
const tile = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) })
const cash = (page: Page) => page.getByRole('button', { name: /^Cash( ·|$)/ }).first()

test('one press adds a product sold one way; one with sizes asks which, and the age check once', async ({ page }) => {
  await visit(page, '/live/till')
  const receipt = page.getByRole('complementary', { name: 'Total to pay' })

  // Sold one way: straight onto the receipt.
  await tile(page, cola).click()
  await expect(receipt.getByText(cola)).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // Sold in two sizes: the tile says so, and opens the size window.
  await expect(tile(page, lager)).toContainText('from £2.30')
  await expect(tile(page, lager)).toContainText('2 sizes')
  await tile(page, lager).click()
  const sizes = page.getByRole('dialog', { name: lager })
  await expect(sizes.getByRole('button', { name: /Half/ })).toBeVisible()
  await noViolations(page)
  await sizes.getByRole('button', { name: /Pint/ }).click()

  // The first age-restricted line asks, once for the sale.
  const prompt = page.getByRole('dialog', { name: /Does the customer look under/ })
  await noViolations(page)
  await prompt.getByRole('button', { name: 'No, clearly over' }).click()
  await expect(receipt.getByText(/^Age check: looked over/)).toBeVisible()
  await tile(page, lager).click()
  await page.getByRole('dialog', { name: lager }).getByRole('button', { name: /Half/ }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // The receipt's steppers change a line; the total follows.
  await receipt.getByRole('button', { name: `One more ${lager}` }).first().click()
  await expect(cash(page)).toBeEnabled()
  await expect(receipt.getByText('£12.70', { exact: true })).toBeVisible() // two pints, a half and a cola
  await receipt.getByRole('button', { name: `Remove ${lager}` }).click() // the half
  await expect(receipt.getByText('£10.40', { exact: true })).toBeVisible()
  await noViolations(page)

  await cash(page).click()
  await expect(page.getByText('Payment in progress: £10.40 to take')).toBeVisible()
  await page.getByRole('button', { name: 'Cash taken' }).click()
  await expect(page.getByText('Paid £10.40', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next customer' }).click()
  await expect(page.getByText('Nothing added yet.')).toBeVisible()
})

test('two devices signed in as the same seller share one sale until one disconnects', async ({ page, browser }) => {
  await visit(page, '/live/till')
  const context = await browser.newContext(as(seller))
  const phone = await context.newPage()
  await visit(phone, '/live/till')
  const receipt = (p: Page) => p.getByRole('complementary', { name: 'Total to pay' })
  const sync = (p: Page) => p.getByTestId('till-sync-wide')
  await expect(sync(page)).toContainText('In sync with')
  await expect(sync(phone)).toContainText('In sync with')

  // Added on one, shown on the other; added to there, shown back here.
  await tile(page, cola).click()
  await expect(receipt(phone).getByText(cola)).toBeVisible()
  await receipt(phone).getByRole('button', { name: `One more ${cola}` }).click()
  await expect(receipt(page).getByText('£4.00', { exact: true }).last()).toBeVisible()

  // The payment started on one is taken on the other, and both move on.
  await cash(page).click()
  await expect(phone.getByText(/^This payment was started on/)).toBeVisible()
  await expect(phone.getByText('Payment in progress: £4.00 to take')).toBeVisible()
  await cash(phone).click()
  await phone.getByRole('button', { name: 'Cash taken' }).click()
  await expect(phone.getByText('Paid £4.00', { exact: true })).toBeVisible()
  await expect(page.getByText('Paid £4.00', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next customer' }).click()

  // Disconnected, the phone is its own till: nothing more arrives, and the choice outlives a reload.
  await sync(phone).click()
  await phone.getByRole('button', { name: 'Disconnect this device' }).click()
  await expect(sync(phone)).toContainText('This device only')
  await tile(page, cola).click()
  await expect(receipt(page).getByText(cola)).toBeVisible()
  await visit(phone, '/live/till')
  await expect(sync(phone)).toContainText('This device only')
  await expect(phone.getByText('Nothing added yet.')).toBeVisible()

  // Linked again with nothing of its own, it takes up the sale.
  await sync(phone).click()
  await phone.getByRole('button', { name: 'Link this device' }).click()
  await expect(receipt(phone).getByText(cola)).toBeVisible()
  await receipt(phone).getByRole('button', { name: `Remove ${cola}` }).click()
  await expect(page.getByText('Nothing added yet.')).toBeVisible()
  await context.close()
})

test('another seller links their device with a code, shares the sale, and leaves', async ({ page, browser }) => {
  await visit(page, '/live/till')
  const context = await browser.newContext(as(person('acc_barseller2', 'Sam Second', ['bar.sale.sell', 'payments.session.open', 'payments.attempt.attest'])))
  const theirs = await context.newPage()
  await visit(theirs, '/live/till')
  const receipt = (p: Page) => p.getByRole('complementary', { name: 'Total to pay' })
  const sync = (p: Page) => p.getByTestId('till-sync-wide')
  await expect(sync(theirs)).toContainText('No other devices')

  // The code shown on one till is typed on the other, which then shares its sale.
  await tile(page, cola).click()
  await sync(page).click()
  await page.getByTestId('till-link-show').click()
  const code = ((await page.getByTestId('till-link-code').textContent()) ?? '').replace(/\D/g, '')
  expect(code).toHaveLength(6)
  await page.keyboard.press('Escape')
  await sync(theirs).click()
  await theirs.getByTestId('till-link-enter').fill(code)
  await theirs.getByRole('button', { name: 'Link to that till' }).click()
  await expect(sync(theirs)).toContainText('In sync with')
  await expect(receipt(theirs).getByText(cola)).toBeVisible()

  // The payment one seller starts is taken by the other.
  await cash(page).click()
  await expect(theirs.getByText('Payment in progress: £2.00 to take')).toBeVisible()
  await cash(theirs).click()
  await theirs.getByRole('button', { name: 'Cash taken' }).click()
  await expect(page.getByText('Paid £2.00', { exact: true })).toBeVisible()
  await expect(theirs.getByText('Paid £2.00', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next customer' }).click()

  // The link outlives a reload, and leaving makes the device its own till again.
  await visit(theirs, '/live/till')
  await expect(sync(theirs)).toContainText('In sync with')
  await tile(page, cola).click()
  await expect(receipt(theirs).getByText(cola)).toBeVisible()
  await sync(theirs).click()
  await theirs.getByTestId('till-link-leave').click()
  await expect(theirs.getByText('Nothing added yet.')).toBeVisible()
  await expect(sync(theirs)).toContainText('No other devices')
  await expect(receipt(page).getByText(cola)).toBeVisible()
  await receipt(page).getByRole('button', { name: `Remove ${cola}` }).click()
  await context.close()
})

test('refusing the age-restricted lines leaves the rest of the sale to carry on', async ({ page }) => {
  await visit(page, '/live/till')
  const receipt = page.getByRole('complementary', { name: 'Total to pay' })
  await tile(page, cola).click()
  await tile(page, lager).click()
  await page.getByRole('dialog', { name: lager }).getByRole('button', { name: /Pint/ }).click()
  await page.getByRole('dialog', { name: /Does the customer look under/ }).getByRole('button', { name: 'Refuse sale' }).click()
  const refusal = page.getByRole('dialog', { name: 'Refuse sale' })
  await expect(refusal.getByRole('radio', { name: /The age-restricted drinks/ })).toBeChecked()
  await noViolations(page)
  await refusal.getByRole('button', { name: 'No ID', exact: true }).click()
  await expect(page.getByText('Refusal recorded in the register', { exact: true })).toBeVisible()
  await expect(receipt.getByText(cola)).toBeVisible()
  await expect(receipt.getByText(lager)).toHaveCount(0)
  // The refusal stands: the same customer cannot be served the lager a moment later.
  await expect(page.getByText(/^Refused at .+: No ID$/)).toBeVisible()
  await expect(tile(page, lager)).toBeDisabled()

  // The whole sale, from the button above the tiles: nothing in it needs an age check, so no product is named.
  await page.getByRole('button', { name: 'Refuse sale' }).click()
  const whole = page.getByRole('dialog', { name: 'Refuse sale' })
  await expect(whole.getByText('so no product is recorded as refused')).toBeVisible()
  await whole.getByRole('button', { name: 'Already drunk' }).click()
  await expect(page.getByText('Nothing added yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Start a new customer' }).click()
  await expect(tile(page, lager)).toBeEnabled()
})

test('on a phone the sale is a bar at the foot with an undo, and opens as a sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await visit(page, '/live/till')
  await tile(page, cola).click()
  await tile(page, cola).click()
  await expect(page.getByText(`Added: ${cola}`)).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: /· £2\.00$/ })).toBeEnabled()
  await noViolations(page)
  await page.getByRole('button', { name: 'Sale (1)' }).click()
  const sheet = page.getByRole('dialog', { name: /^Sale/ })
  await expect(sheet.getByText(cola)).toBeVisible()
  await sheet.getByRole('button', { name: `Remove ${cola}` }).click()
  await expect(sheet.getByText('Nothing added yet.')).toBeVisible()
})

test('a drink with choices opens one window: size, the usual spirit already picked, any mixer, and the age check follows what is picked', async ({ page }) => {
  await visit(page, '/live/till')
  const receipt = page.getByRole('complementary', { name: 'Total to pay' })
  await tile(page, mixed).click()
  const window = page.getByRole('dialog', { name: mixed })
  await expect(window.getByRole('button', { name: /^House gin/ })).toHaveAttribute('aria-pressed', 'true')
  // The mixer has no usual choice, so it must be picked before the drink can be added.
  await expect(window.getByRole('button', { name: /^Add/ })).toBeDisabled()
  await window.getByRole('button', { name: /^Double/ }).click()
  await window.getByRole('button', { name: /^Premium gin/ }).click()
  await window.getByRole('group', { name: `Mixer ${run}` }).getByRole('button', { name: cola }).click()
  await noViolations(page)
  await window.getByRole('button', { name: 'Add · £7.50' }).click()
  // The product is not age-restricted; the gin picked on it is.
  await page.getByRole('dialog', { name: /Does the customer look under/ }).getByRole('button', { name: 'No, clearly over' }).click()
  await expect(receipt.getByText(`Double · Premium gin · ${cola}`)).toBeVisible()

  // The alcohol-free one asks nothing, and is a line of its own.
  await tile(page, mixed).click()
  await window.getByRole('button', { name: /^Alcohol-free gin/ }).click()
  await window.getByRole('group', { name: `Mixer ${run}` }).getByRole('button', { name: cola }).click()
  await window.getByRole('button', { name: 'Add · £4.50' }).click()
  await expect(receipt.getByText(`Single · Alcohol-free gin · ${cola}`)).toBeVisible()
  await expect(receipt.getByText('£12.00', { exact: true })).toBeVisible()

  await cash(page).click()
  await expect(page.getByText('Payment in progress: £12.00 to take')).toBeVisible()
  await page.getByRole('button', { name: 'Cash taken' }).click()
  await expect(page.getByText('Paid £12.00', { exact: true })).toBeVisible()
})

test('the allergens sheet is a matrix that says where each product stands against what the customer avoids', async ({ page }) => {
  await visit(page, '/live/till')
  await page.getByRole('button', { name: 'Allergens' }).click()
  const sheet = page.getByRole('dialog', { name: 'Allergens' })
  const row = (name: string) => sheet.getByRole('row').filter({ has: page.getByRole('rowheader', { name }) })
  // The columns run in the law's order: Milk is the seventh, Tree nuts the eighth.
  await expect(sheet.getByRole('row').first().getByRole('columnheader')).toHaveCount(15)
  await expect(row(chocolate).getByRole('cell').nth(6)).toHaveText('Contains')
  await expect(row(chocolate).getByRole('cell').nth(7)).toHaveText('May contain')
  await expect(row(chocolate).getByRole('cell').nth(0)).toHaveText('')
  await expect(row(cola)).toContainText('Not checked: read the label')
  await sheet.getByRole('button', { name: 'Tree nuts' }).click()
  await expect(sheet.getByRole('button', { name: 'Tree nuts' })).toHaveAttribute('aria-pressed', 'true')
  await expect(row(chocolate).getByRole('rowheader')).toContainText('May contain Tree nuts.')
  await expect(row(chocolate).getByRole('rowheader')).not.toContainText('Milk')
  await sheet.getByRole('button', { name: 'Tree nuts' }).click()
  await sheet.getByRole('button', { name: 'Fish' }).click()
  await expect(row(chocolate).getByRole('rowheader')).toContainText('None of these recorded')
  await noViolations(page)
})

test('an outlet set to folders opens on its favourites, and a folder opens its sub-folders', async ({ page, playwright }) => {
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  const layout = async (tillLayout: string) => {
    for (const id of outletIds) expect((await api.patch(`/api/bar/outlets/${id}`, { data: { tillLayout }, headers: key() })).ok()).toBe(true)
  }
  await layout('folders')
  for (const id of outletIds) await post(api, `/api/bar/outlets/${id}/favourites`, { variantIds: [colaVariant] })
  try {
    await visit(page, '/live/till')
    const receipt = page.getByRole('complementary', { name: 'Total to pay' })
    // The favourite is at the front, and adds with one press.
    await page.getByRole('region', { name: 'Favourites' }).getByRole('button', { name: new RegExp(`^${cola}`) }).click()
    await expect(receipt.getByText(cola)).toBeVisible()
    // Snacks holds only a sub-folder; the product is inside it.
    await expect(tile(page, chocolate)).toHaveCount(0)
    await page.getByRole('button', { name: new RegExp(`^Snacks ${run}`) }).click()
    await page.getByRole('button', { name: new RegExp(`^Chocolate ${run}`) }).click()
    await noViolations(page)
    await tile(page, chocolate).click()
    await expect(receipt.getByText(chocolate)).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('button', { name: new RegExp(`^Chocolate ${run}`) })).toBeVisible()

    // The side list shows a category at a time, the favourites first and open to begin with.
    await layout('rail')
    await visit(page, '/live/till')
    await expect(page.getByRole('group', { name: 'Categories' }).getByRole('button').first()).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('group', { name: 'Categories' }).getByRole('button', { name: `Snacks ${run}` }).click()
    await expect(tile(page, chocolate)).toBeVisible()
    await noViolations(page)
  }
  finally {
    await layout('chips')
    await api.dispose()
  }
})
