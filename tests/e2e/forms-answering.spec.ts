// Answering a form and reading what comes back (docs/specs/form-builder, slice 3): a published form
// is shared at an address, anyone with it answers without an account, somebody signed in has their
// answers kept as they go and finds them under My forms, and the author reads the responses in a
// table, opens one and exports them.
import { test, expect, type Browser, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const author = { kind: 'person', accountId: 'acc_formsauthor', name: 'Ada Author', assurance: 'strong', reassertedAt: Date.now(), grants: ['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'forms.response.read', 'forms.response.export'].map(grant) }
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const member = { kind: 'person', accountId: `acc_formsmember${run}`, name: 'Mo Member', assurance: 'strong', reassertedAt: Date.now(), grants: [] }
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(author) }, viewport: { width: 1280, height: 900 } })

test.beforeAll(async ({ playwright, baseURL }) => {
  // A form's date questions are checked against today in the theatre's time zone.
  const owner = { kind: 'person', accountId: 'acc_formsowner', name: 'Forms Owner', assurance: 'strong', reassertedAt: Date.now(), grants: [grant('core.settings.manage')] }
  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'x-test-actor': JSON.stringify(owner) } })
  expect((await api.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })).ok()).toBe(true)
  await api.dispose()
})

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
async function axe(page: Page) {
  // A colour or a closing menu still in motion is not what the page settles to.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))))
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
async function add(page: Page, type: string, wording: string) {
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: type, exact: true }).click()
  await page.getByLabel('Question', { exact: true }).fill(wording)
}
const saved = (page: Page) => expect(page.locator('[aria-live=polite]').filter({ hasText: /^\s*Saved\s*$/ })).toBeVisible()
/** Somebody else's browser: a visitor with no account, or a person signed in. */
async function as(browser: Browser, actor: object | null, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport, extraHTTPHeaders: actor ? { 'x-test-actor': JSON.stringify(actor) } : {} })
  return context.newPage()
}

/** Builds a two-question form, publishes it and shares it; gives back where it is answered and where it is built. */
async function share(page: Page, title: string) {
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  await page.getByRole('textbox', { name: /^Title/ }).fill(title)
  await page.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  await add(page, 'Short text', 'Who are you nominating?')
  await page.getByRole('combobox').filter({ hasText: 'Not required' }).click()
  await page.getByRole('option', { name: 'Required', exact: true }).click()
  await add(page, 'Long text', 'Why do they deserve it?')
  await saved(page)
  // A form that asks for personal answers says how long they are kept before it is published.
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Form settings' }).click()
  // The period is a number and a unit, and the unit starts at years.
  await page.getByRole('spinbutton', { name: /^Keep answers for/ }).fill('1')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Form settings' })).toBeHidden()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await page.getByRole('button', { name: 'Publish version 1' }).click()
  // Publishing for the first time shares the form in the same step, and shows its address.
  const dialog = page.getByRole('dialog', { name: 'Share' })
  await expect(dialog.getByLabel('Address')).toHaveValue(/\/forms\//)
  const address = new URL(await dialog.getByLabel('Address').inputValue()).pathname
  return { dialog, address, builder: new URL(page.url()).pathname }
}

test('a shared form is answered without an account, and the author reads the response', async ({ page, browser }) => {
  const { dialog, address, builder } = await share(page, `Nominations ${run}`)
  await axe(page)
  // Publishing for the first time shared it in the same step.
  await expect(dialog.getByText('0 responses so far')).toBeVisible()

  const visitor = await as(browser, null)
  await visit(visitor, address)
  await expect(visitor.getByRole('heading', { name: `Nominations ${run}` })).toBeVisible()
  await axe(visitor)
  // What is required is asked for in words, by the question.
  await visitor.getByRole('button', { name: 'Send' }).click()
  await expect(visitor.getByText('Answer this question.')).toBeVisible()
  await visitor.getByLabel('Who are you nominating?').fill('Grace Hopper')
  await visitor.getByLabel('Why do they deserve it?').fill('She ran the get-in single-handed.')
  await visitor.getByRole('button', { name: 'Send' }).click()
  await expect(visitor.getByText('Enter your email address.')).toBeVisible()
  await visitor.getByLabel('Your email address').fill(`visitor-${run}@example.com`)
  // Answers survive the page being opened again before they are sent.
  await visitor.waitForTimeout(1500)
  await visit(visitor, address)
  await expect(visitor.getByLabel('Who are you nominating?')).toHaveValue('Grace Hopper')
  await visitor.getByRole('button', { name: 'Send' }).click()
  await expect(visitor.getByText(/Your reference is [A-Z0-9-]+\./)).toBeVisible()
  const reference = (await visitor.getByText(/Your reference is/).innerText()).match(/is ([A-Z0-9-]+)\./)![1]!
  await axe(visitor)

  // The author finds it in the table, opens it and can export.
  await visit(page, `${builder}/responses`)
  await expect(page.getByText('1 response', { exact: true })).toBeVisible()
  const table = page.getByRole('table', { name: 'Responses' })
  await expect(table.getByRole('columnheader', { name: 'Who are you nominating?' })).toBeVisible()
  await expect(table.getByRole('cell', { name: 'Grace Hopper' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Export as CSV' })).toHaveAttribute('href', /\/responses\/export$/)
  await axe(page)
  await page.getByRole('button', { name: `Open response ${reference}` }).click()
  const panel = page.getByRole('dialog', { name: `Response ${reference}` })
  await expect(panel.getByText('She ran the get-in single-handed.')).toBeVisible()
  await expect(page).toHaveURL(/open=fres_/)
  await axe(page)
  await page.keyboard.press('Escape')

  // A view is in the address, so it can be sent to somebody else.
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('combobox').filter({ hasText: 'Any question' }).click()
  await page.getByRole('option', { name: 'Who are you nominating?' }).click()
  await page.getByLabel('Is', { exact: true }).fill('Somebody else')
  await page.getByLabel('Is', { exact: true }).press('Enter')
  await expect(page.getByText('No responses match these filters')).toBeVisible()
  await expect(page).toHaveURL(/question=.+value=Somebody/)
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(table.getByRole('cell', { name: 'Grace Hopper' })).toBeVisible()
})

test('somebody signed in has their answers kept, and finds them under My forms', async ({ page, browser }) => {
  const { dialog, address } = await share(page, `Feedback ${run}`)
  await expect(dialog.getByText('0 responses so far')).toBeVisible()
  await dialog.getByRole('switch', { name: 'One response each' }).click()
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Sharing saved', { exact: true })).toBeVisible()

  const mine = await as(browser, member)
  await visit(mine, address)
  await expect(mine.getByLabel('Your email address')).toHaveCount(0)
  await mine.getByLabel('Who are you nominating?').fill('Alan Turing')
  await expect(mine.getByText('Saved to your account.')).toBeVisible()

  await visit(mine, '/account/forms')
  await expect(mine.getByText('Not finished')).toBeVisible()
  await axe(mine)
  await mine.getByRole('link', { name: new RegExp(`Feedback ${run}`) }).click()
  await expect(mine.getByLabel('Who are you nominating?')).toHaveValue('Alan Turing')
  await mine.getByRole('button', { name: 'Send' }).click()
  await expect(mine.getByText(/Your reference is/)).toBeVisible()

  // One response each: the form says so rather than taking a second.
  await visit(mine, address)
  await expect(mine.getByText('You have already answered this form')).toBeVisible()
  await visit(mine, '/account/forms')
  await mine.getByRole('link', { name: new RegExp(`Feedback ${run}`) }).click()
  await expect(mine.getByText('Alan Turing')).toBeVisible()
  await axe(mine)
})

test.describe('on a phone', () => {
  test('a form is answered without the page scrolling sideways', async ({ page, browser }) => {
    const { dialog, address } = await share(page, `Phone answers ${run}`)
    // Publishing for the first time shared it in the same step.
    await expect(dialog.getByText('0 responses so far')).toBeVisible()
    const phone = await as(browser, null, { width: 390, height: 800 })
    await visit(phone, address)
    await phone.getByLabel('Who are you nominating?').fill('Ada Lovelace')
    await phone.getByLabel('Your email address').fill(`phone-${run}@example.com`)
    await axe(phone)
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await phone.getByRole('button', { name: 'Send' }).click()
    await expect(phone.getByText(/Your reference is/)).toBeVisible()
  })
})
