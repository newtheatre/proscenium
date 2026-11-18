// The form builder (docs/specs/form-builder): one page with the pages down the side, the questions
// in the middle and the selected one's details beside them. Options are rows, questions move by
// dragging, every change saves itself, problems are listed, and a form is published from a dialog
// that says what changes. The engine's case set also runs here, in a real browser.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const author = { kind: 'person', accountId: 'acc_formsauthor', name: 'Ada Author', assurance: 'strong', reassertedAt: Date.now(), grants: ['forms.form.create', 'forms.form.edit', 'forms.form.publish', 'gallery.sample.view'].map(grant) }
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(author) }, viewport: { width: 1440, height: 1000 } })

// Other browser tests share the database, so this one's forms carry a name of their own.
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
async function create(page: Page, title: string) {
  await visit(page, '/console/forms')
  await page.getByRole('button', { name: 'New form' }).first().click()
  await page.getByRole('textbox', { name: /^Title/ }).fill(title)
  await page.getByRole('button', { name: 'Create form' }).click()
  await page.waitForURL(/\/console\/forms\/frm_/)
  await expect(page.getByRole('button', { name: 'Add a question', exact: true })).toBeVisible()
}
async function add(page: Page, type: string, wording?: string) {
  await page.getByRole('button', { name: 'Add a question', exact: true }).click()
  await page.getByRole('menuitem', { name: type, exact: true }).click()
  if (wording !== undefined) await page.getByLabel('Question', { exact: true }).fill(wording)
}
/**
 * Drags one question to the place of another above it. The list makes room while the question is
 * still held, so this keeps the pointer moving over the place until it has, then lets go.
 */
async function reorder(page: Page, from: string, onto: string) {
  const a = (await page.getByLabel(`Drag to move ${from}`).boundingBox())!
  const b = (await page.getByLabel(`Drag to move ${onto}`).boundingBox())!
  const x = b.x + b.width / 2
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2, a.y - 10, { steps: 5 })
  await page.mouse.move(x, b.y + 4, { steps: 15 })
  for (let i = 0; i < 20 && (await order(page))[0] !== from; i++) {
    await page.mouse.move(x, b.y + 4 + (i % 2 ? 3 : -3), { steps: 3 })
    await page.waitForTimeout(100)
  }
  await page.mouse.up()
}
const order = (page: Page) => page.locator('[aria-label^="Drag to move"]').evaluateAll(els => els.map(e => (e.getAttribute('aria-label') ?? '').replace('Drag to move ', '')))
const saved = (page: Page) => expect(page.locator('[aria-live=polite]').filter({ hasText: /^\s*Saved\s*$/ })).toBeVisible()
const card = (page: Page, name: string) => page.locator('.group\\/card', { hasText: name })

/** Drags onto a part of something, as a person does: pick up by the grip, travel, look where the target now is, settle, let go. */
async function drag(page: Page, from: string, to: ReturnType<Page['locator']>, where: (b: { x: number, y: number, width: number, height: number }) => [number, number]) {
  const a = (await page.getByLabel(`Drag to move ${from}`).boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 5, a.y + a.height / 2 - 12, { steps: 4 })
  const [x, y] = where((await to.boundingBox())!)
  await page.mouse.move(x, a.y + a.height / 2, { steps: 10 })
  await page.mouse.move(x, y, { steps: 20 })
  await page.waitForTimeout(250)
  const [x2, y2] = where((await to.boundingBox())!)
  await page.mouse.move(x2, y2, { steps: 10 })
  await page.waitForTimeout(250)
  await page.mouse.up()
}

test('the engine gives the same answers in a browser as on the server', async ({ page }) => {
  await visit(page, '/console/gallery/forms-cases')
  await expect(page.locator('[data-test=summary]')).toHaveText(/^(\d+) of \1 cases pass\s*$/)
  expect(await page.locator('[data-test=failure]').allInnerTexts()).toEqual([])
})

test('a form is built with questions, options as rows and logic, and saves itself', async ({ page }) => {
  await create(page, `Award nominations ${run}`)
  await page.getByLabel('Page title').first().fill('Your nomination')
  await add(page, 'Short text', 'Who are you nominating?')
  await add(page, 'Choose one', 'Which award?')
  // Each option is a row of its own.
  await page.getByLabel('Option 1', { exact: true }).fill('Best newcomer')
  await page.getByLabel('Option 2', { exact: true }).fill('Lifetime service')
  await page.getByRole('button', { name: 'Add option' }).click()
  await page.getByLabel('Option 3', { exact: true }).fill('Unsung hero')
  await add(page, 'Long text', 'Why do they deserve it?')
  await page.getByRole('combobox').filter({ hasText: 'Not required' }).click()
  await page.getByRole('option', { name: 'Required', exact: true }).click()
  await expect(card(page, 'Why do they deserve it?').getByText('Required')).toBeVisible()
  expect(await order(page)).toEqual(['Who are you nominating?', 'Which award?', 'Why do they deserve it?'])
  await saved(page)
  await axe(page)

  // What was built is still there after leaving and coming back.
  await visit(page, page.url())
  await expect(page.getByLabel('Drag to move Which award?')).toBeVisible()
  expect(await order(page)).toEqual(['Who are you nominating?', 'Which award?', 'Why do they deserve it?'])
  await page.getByRole('button', { name: /^Choose one Which award\?/ }).click()
  await expect(page.getByLabel('Option 3', { exact: true })).toHaveValue('Unsung hero')

  // The preview is the form as people will see it, and holds them to what is required.
  await page.getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByText('This is the form as people will see it.')).toBeVisible()
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Answer this question.')).toBeVisible()
  await axe(page)
})

test('questions move by dragging, sit side by side when dropped on an edge, and undo puts them back', async ({ page }) => {
  await create(page, `Dragging ${run}`)
  await add(page, 'Short text', 'First name')
  await add(page, 'Short text', 'Last name')
  await add(page, 'Email address', 'Email')
  expect(await order(page)).toEqual(['First name', 'Last name', 'Email'])

  await reorder(page, 'Email', 'First name')
  await expect.poll(() => order(page)).toEqual(['Email', 'First name', 'Last name'])
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => order(page)).toEqual(['First name', 'Last name', 'Email'])

  // Dropped on the right-hand edge of another question, the two share a line.
  await drag(page, 'Last name', card(page, 'First name').first(), b => [b.x + b.width - 40, b.y + b.height / 2])
  await expect(page.getByLabel('Drag to move Two questions side by side')).toBeVisible()
  const first = (await page.getByRole('button', { name: /^Short text First name/ }).boundingBox())!
  const last = (await page.getByRole('button', { name: /^Short text Last name/ }).boundingBox())!
  expect(Math.abs(first.y - last.y)).toBeLessThan(8)
  expect(last.x).toBeGreaterThan(first.x + 100)
  await saved(page)
})

test('problems are listed and stop a form being published until they are fixed', async ({ page }) => {
  await create(page, `Feedback ${run}`)
  await add(page, 'Short text')
  await expect(page.getByRole('button', { name: '1 problem' })).toBeVisible()
  await page.getByRole('button', { name: '1 problem' }).click()
  await expect(page.getByRole('button', { name: 'Untitled question Needs its wording.', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await saved(page)

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByText('One problem must be fixed first')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).first().click()

  await page.getByRole('button', { name: /^Short text Untitled question/ }).click()
  await page.getByLabel('Question', { exact: true }).fill('How was your evening?')
  await expect(page.getByRole('button', { name: '0 problems' })).toBeVisible()
  await saved(page)

  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByText('New question')).toBeVisible()
  await axe(page)
  await page.getByRole('button', { name: 'Publish version 1' }).click()
  await expect(page.getByText('Version 1 is live')).toBeVisible()
})

test('a form goes out as JSON and comes back in', async ({ page }) => {
  await create(page, `Sign-up ${run}`)
  await page.getByLabel('Page title').first().fill('About you')
  await add(page, 'Yes or no', 'Are you a member?')
  await saved(page)
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Form as JSON' }).click()
  const box = page.getByRole('textbox', { name: 'Form as JSON' })
  const text = await box.inputValue()
  expect(JSON.parse(text).pages[0].title).toBe('About you')

  // Text that is not a form is refused in plain words, and nothing changes.
  await box.fill('{ "pages": ')
  await page.getByRole('button', { name: 'Apply to the form' }).click()
  await expect(page.getByText('This is not JSON.')).toBeVisible()

  await box.fill(text.replace('Are you a member?', 'Have you joined?'))
  await page.getByRole('button', { name: 'Apply to the form' }).click()
  await expect(page.getByLabel('Drag to move Have you joined?')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByLabel('Drag to move Are you a member?')).toBeVisible()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 800 } })
  test('the details open over the questions rather than beside them', async ({ page }) => {
    await create(page, `Phone ${run}`)
    await add(page, 'Short text')
    const details = page.getByRole('dialog', { name: 'Question' })
    await details.getByLabel('Question', { exact: true }).fill('What should we call you?')
    await axe(page)
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()
    await expect(page.getByRole('button', { name: /^Short text What should we call you\?/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
