// The kit's date, date range, date and time and money fields, filled by keyboard and with axe. One
// test here covers them for every module: a module's own tests need not fill one again.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const staff = { kind: 'person', accountId: 'acc_datefields', name: 'Dana Dates', grants: [{ ability: 'gallery.sample.view', via: 'test' }] }
// The theatre has no time zone set in the test site, so the date and time field works in the browser's.
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(staff) }, timezoneId: 'Europe/London', locale: 'en-US' })

/** A date control is typed part by part: focus its first part, then type the digits. */
async function type(page: Page, label: string, digits: string) {
  await page.getByRole('group', { name: label }).getByRole('spinbutton').first().click()
  await page.keyboard.type(digits)
}

test('date fields read day first on a 24-hour clock, and give the values the server takes', async ({ page }) => {
  await page.goto('/console/gallery/choices')
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  await page.getByRole('checkbox', { name: 'Hearing loop' }).click()

  // British order whatever the browser's own language: 1 September, not 9 January.
  await type(page, 'Opens', '01092027')
  await type(page, 'Run', '0109202704092027')
  await type(page, 'Curtain up', '010920271930')
  await page.getByLabel(/^Price/).fill('12.5')
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])

  await page.getByRole('button', { name: 'Save choices' }).click()
  const saved = page.getByTestId('saved')
  await expect(saved).toContainText('"opens":"2027-09-01"')
  await expect(saved).toContainText('"run":{"start":"2027-09-01","end":"2027-09-04"}')
  // 19:30 in London in September is 18:30 UTC.
  await expect(saved).toContainText(`"curtain":${Date.UTC(2027, 8, 1, 18, 30)}`)
  await expect(saved).toContainText('"price":1250')
})

test('a day can be chosen from the calendar', async ({ page }) => {
  await page.goto('/console/gallery/choices')
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  await page.getByRole('checkbox', { name: 'Hearing loop' }).click()
  await type(page, 'Opens', '01092027')
  await page.getByRole('group', { name: 'Opens' }).getByRole('button', { name: 'Choose from a calendar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /15 September 2027/ }).click()
  await page.getByRole('button', { name: 'Save choices' }).click()
  await expect(page.getByTestId('saved')).toContainText('"opens":"2027-09-15"')
})
