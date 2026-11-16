// The radio and ticks fields of PageForm, by keyboard and with axe.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const staff = { kind: 'person', accountId: 'acc_formfields', name: 'Fran Fields', grants: [{ ability: 'gallery.sample.view', via: 'test' }] }
test.use({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(staff) } })

test('radio and ticks fields work, show notes only when ticked, and save the values', async ({ page }) => {
  await page.goto('/console/gallery/choices')
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  await expect(page.getByLabel('Anything we should know?')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save choices' }).click()
  await expect(page.getByText('Choose at least one.', { exact: true })).toBeVisible()
  await page.getByRole('radio', { name: 'Two' }).click()
  await page.getByRole('checkbox', { name: 'Hearing loop' }).click()
  await page.getByLabel('Anything we should know?').fill('Front row please')
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Save choices' }).click()
  await expect(page.getByTestId('saved')).toContainText('"companions":2')
  await expect(page.getByTestId('saved')).toContainText('"note":"Front row please"')
})
