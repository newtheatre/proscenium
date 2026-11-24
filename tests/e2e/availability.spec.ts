// My availability (AV-04) in a real browser: painting by drag, keyboard and heading, a change for some
// dates, weekly patterns, and a request answered by the member and followed by its organiser.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const owner = { kind: 'person', accountId: 'acc_e2eowner', name: 'Browser Tests', assurance: 'strong', reassertedAt: Date.now(), grants: ['core.modules.manage', 'core.settings.manage'].map(ability => ({ ability, via: 'test' })) }
const member = { kind: 'person', accountId: `acc_avail${Date.now() % 1_000_000}`, name: 'Ada Available', assurance: 'strong', reassertedAt: Date.now(), grants: [] }
const organiser = { kind: 'person', accountId: `acc_organ${Date.now() % 1_000_000}`, name: 'Olly Organiser', assurance: 'strong', reassertedAt: Date.now(), grants: ['availability.request.send', 'availability.find.anyone', 'availability.find.use', 'availability.entry.on-behalf', 'availability.meeting.arrange'].map(ability => ({ ability, via: 'test' })) }
const output = fileURLToPath(new URL('../../.output', import.meta.url))
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
// A Monday three to four weeks ahead, so every day in view can be painted.
const monday = new Date(Date.now() + (21 + ((8 - new Date().getUTCDay()) % 7)) * 86_400_000).toISOString().slice(0, 10)
const WEEK = `/members/availability?from=${monday}`

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => {
  await page.mouse.move(0, 0)
  // A button still fading back from its loading state is not what the page settles to.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(a => a.effect?.getComputedTiming().iterations !== Infinity)
    .map(a => a.finished.catch(() => null))))
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}
const cell = (page: Page, day: string, from: string) => page.getByRole('gridcell', { name: new RegExp(`^${day}.*, ${from} to `) })

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ playwright }) => {
  // A member and an organiser: accounts holding a role that opens the members' area, written as the Admin screens would.
  const id = member.accountId.slice(4)
  const at = Date.now() - 60_000
  const sql = [
    `INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES ('${member.accountId}', '${member.name}', 'self', ${at}, ${at})`,
    `INSERT INTO core_roles (id, key, name, fixed, opens_members_area, needs_managed_identity, expiry_rule, created_at) VALUES ('rol_${id}', 'avail-${id}', 'Availability tests', 0, 1, 0, 'none', ${at})`,
    `INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES ('grt_${id}', '${member.accountId}', 'rol_${id}', 'site', ${at}, 'acc_e2eowner', ${at})`,
    `INSERT INTO core_accounts (id, name, origin, created_at, first_signed_in_at) VALUES ('${organiser.accountId}', '${organiser.name}', 'self', ${at}, ${at})`,
    `INSERT INTO core_grants (id, account_id, role_id, scope, starts_at, granted_by, granted_at) VALUES ('grt_o${id}', '${organiser.accountId}', 'rol_${id}', 'site', ${at}, 'acc_e2eowner', ${at})`,
  ].join('; ')
  execFileSync('bunx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', '../.wrangler/e2e', '--config', 'server/wrangler.json', '--command', sql], { cwd: output, stdio: 'pipe' })
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(owner) })
  const zone = await api.put('/api/core/settings', { data: { changes: [{ key: 'core.locale.time-zone', value: 'Europe/London' }], confirm: true } })
  expect(zone.status(), await zone.text()).toBe(200)
  const response = await api.put('/api/core/modules/availability', { data: { on: true } })
  expect(response.status(), await response.text()).toBe(200)
  await api.dispose()
})

test.describe('a member', () => {
  test.use(as(member))

  test('paints a stretch by dragging down a day', async ({ page }) => {
    await visit(page, WEEK)
    await expect(page.getByRole('heading', { level: 1, name: 'My availability' })).toBeVisible()
    await page.getByRole('tab', { name: 'Busy' }).click()
    const start = cell(page, 'Tue', '18:00')
    const end = cell(page, 'Tue', '19:30')
    await start.scrollIntoViewIfNeeded()
    await start.hover()
    await page.mouse.down()
    await end.hover()
    await page.mouse.up()
    await expect(cell(page, 'Tue', '19:30')).toHaveAccessibleName(/Busy$/)
    await expect(cell(page, 'Tue', '20:00')).toHaveAccessibleName(/Not known$/)
    await noViolations(page)
  })

  test('paints with the keyboard: Enter where it starts, arrows, Enter where it ends', async ({ page }) => {
    await visit(page, WEEK)
    await page.getByRole('tab', { name: 'Maybe' }).click()
    const start = cell(page, 'Wed', '10:00')
    await start.scrollIntoViewIfNeeded()
    await start.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(cell(page, 'Wed', '10:30')).toHaveAccessibleName(/Maybe$/)
  })

  test('paints a whole day from its heading, and clears part of it', async ({ page }) => {
    await visit(page, WEEK)
    await page.getByRole('tab', { name: 'Free' }).click()
    await page.getByRole('button', { name: /^Paint all of Thu/ }).click()
    await expect(cell(page, 'Thu', '12:00')).toHaveAccessibleName(/Free$/)
    await page.getByRole('tab', { name: 'Clear' }).click()
    await cell(page, 'Thu', '12:00').click()
    await expect(cell(page, 'Thu', '12:00')).toHaveAccessibleName(/Not known$/)
    await expect(cell(page, 'Thu', '12:30')).toHaveAccessibleName(/Free$/)
  })

  test('reads who can see their availability', async ({ page }) => {
    await visit(page, WEEK)
    await page.getByRole('link', { name: 'Who can see my availability' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Who can see my availability' })).toBeVisible()
    await expect(page.getByText('Reasons you did not share.')).toBeVisible()
    await noViolations(page)
  })

  test('adds a change for some dates with a shared reason', async ({ page }) => {
    await visit(page, WEEK)
    await page.getByRole('button', { name: 'Add a change' }).click()
    const panel = page.getByRole('dialog', { name: 'Add a change' })
    await panel.getByRole('textbox', { name: 'Reason' }).fill('Exams')
    await panel.getByRole('checkbox', { name: /Share the reason/ }).check()
    await noViolations(page)
    await panel.getByRole('button', { name: 'Save change' }).click()
    await expect(page.getByText('Change saved', { exact: true })).toBeVisible()
    await expect(page.getByRole('list').filter({ hasText: 'Exams' })).toContainText('Reason shared')
  })
})

test.describe('a member with a weekly pattern', () => {
  test.use(as(member))

  test('makes a pattern, paints its week, and is asked once what a stroke on a pattern day changes', async ({ page }) => {
    await visit(page, '/members/availability/patterns')
    await page.getByRole('button', { name: 'New pattern' }).first().click()
    const panel = page.getByRole('dialog', { name: 'New pattern' })
    await panel.getByRole('textbox', { name: 'Name' }).fill('Spring term')
    await panel.getByRole('button', { name: 'Create pattern' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Spring term' })).toBeVisible()
    await page.getByRole('tab', { name: 'Busy' }).click()
    await cell(page, 'Tuesday', '18:00').hover()
    await page.mouse.down()
    await cell(page, 'Tuesday', '19:30').hover()
    await page.mouse.up()
    await expect(cell(page, 'Tuesday', '19:00')).toHaveAccessibleName(/Busy$/)
    await noViolations(page)
    await page.getByRole('button', { name: 'Save pattern' }).click()
    await expect(page.getByText('Pattern saved', { exact: true })).toBeVisible()

    await visit(page, WEEK)
    await expect(cell(page, 'Tue', '19:00')).toHaveAccessibleName(/Busy$/)
    await page.getByRole('tab', { name: 'Free' }).click()
    await cell(page, 'Tue', '19:00').click()
    const ask = page.getByRole('dialog', { name: 'Just these days, or every week?' })
    await ask.getByRole('button', { name: 'Just these days' }).click()
    await expect(cell(page, 'Tue', '19:00')).toHaveAccessibleName(/Free$/)
    await expect(cell(page, 'Tue', '18:30')).toHaveAccessibleName(/Busy$/)
  })
})

test.describe('a request to check availability', () => {
  let requestId = ''

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(organiser) })
    const made = await api.post('/api/availability/requests', {
      headers: { 'idempotency-key': `e2e-${Date.now()}` },
      data: { title: 'Spring rehearsals', message: 'Please mark your exams.', groupIds: [], accountIds: [member.accountId], from: monday, to: monday, dueOn: monday },
    })
    expect(made.status(), await made.text()).toBe(200)
    requestId = (await made.json()).requestId
    await api.dispose()
  })

  test.describe('the member asked', () => {
    test.use(as(member))

    test('finds it under Asked of me, reads the message, and answers it', async ({ page }) => {
      await visit(page, '/members/availability/requests')
      await page.getByRole('link', { name: /Spring rehearsals/ }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Spring rehearsals' })).toBeVisible()
      await expect(page.getByText('Please mark your exams.')).toBeVisible()
      await expect(cell(page, 'Mon', '12:00')).toBeVisible()
      await noViolations(page)
      await page.getByRole('button', { name: 'This is right' }).click()
      await expect(page.getByText('Answered', { exact: true }).first()).toBeVisible()
    })
  })

  test.describe('its organiser', () => {
    test.use(as(organiser))

    test('sees who has answered and can stop asking someone', async ({ page }) => {
      await visit(page, '/members/find-a-time/requests')
      await expect(page.getByRole('link', { name: /Spring rehearsals/ }).first()).toContainText('1 of 1 answered')
      await visit(page, `/members/find-a-time/requests/${requestId}`)
      const people = page.getByRole('list').filter({ hasText: member.name })
      await expect(people).toContainText('Answered')
      await noViolations(page)
      await page.getByRole('button', { name: `Actions for ${member.name}` }).click()
      await page.getByRole('menuitem', { name: 'Stop asking' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Stop asking' }).click()
      await expect(people).toContainText('No longer asked')
    })
  })
})

test.describe('finding a time', () => {
  test.use(as(organiser))

  test('finds the best times for the company, shows who is free, and marks someone who must come', async ({ page }) => {
    await visit(page, '/members/find-a-time')
    await expect(page.getByRole('heading', { level: 1, name: 'Find a time' })).toBeVisible()
    await page.getByRole('button', { name: 'Find times' }).click()
    await expect(page.getByText('Choose at least one group.')).toBeVisible()
    await page.getByRole('button', { name: /^Groups/ }).click()
    await page.getByRole('option', { name: 'Gallery company' }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Find times' }).click()
    await expect(page.getByRole('heading', { name: 'Best times' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /Ada Available/ })).toBeVisible()
    await noViolations(page)
    await page.getByRole('button', { name: 'Who' }).first().click()
    const panel = page.getByRole('dialog')
    await expect(panel.getByRole('heading', { name: /^Not known/ })).toBeVisible()
    await expect(panel).toContainText('Ada Available')
    await noViolations(page)
    await page.keyboard.press('Escape')
    await page.getByRole('checkbox', { name: /Ada Available/ }).check()
    await expect(page.getByText('No time works for everyone who must come')).toBeVisible()
  })
})

test.describe('a poll', () => {
  let pollUrl = ''

  test.describe('its organiser', () => {
    test.use(as(organiser))

    test('picks two of the best times and sends them as a poll', async ({ page }) => {
      await visit(page, '/members/find-a-time')
      await page.getByRole('button', { name: /^Groups/ }).click()
      await page.getByRole('option', { name: 'Gallery company' }).click()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Find times' }).click()
      await page.getByRole('button', { name: 'Add to poll' }).first().click()
      await expect(page.getByRole('button', { name: 'Send a poll' })).toBeDisabled()
      await page.getByRole('button', { name: 'Add to poll' }).first().click()
      await expect(page.getByRole('heading', { name: 'Times for a poll (2)' })).toBeVisible()
      await noViolations(page)
      await page.getByRole('button', { name: 'Send a poll' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('textbox', { name: /^Title/ }).fill('Cast reading')
      await noViolations(page)
      await dialog.getByRole('button', { name: 'Send a poll' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Cast reading' })).toBeVisible()
      pollUrl = page.url()
    })
  })

  test.describe('a member asked', () => {
    test.use(as(member))

    test('answers it from Asked of me, seeing only their own answers', async ({ page }) => {
      await visit(page, '/members/availability/requests')
      await page.getByRole('link', { name: /Cast reading/ }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Cast reading' })).toBeVisible()
      await expect(page.getByText('Only the person who sent the poll sees your answers')).toBeVisible()
      await page.getByRole('radio', { name: 'Yes' }).first().check()
      await page.getByRole('radio', { name: 'If need be' }).nth(1).check()
      await noViolations(page)
      await page.getByRole('button', { name: 'Save answers' }).click()
      await expect(page.getByText('Answers saved')).toBeVisible()
    })
  })

  test.describe('its organiser, later', () => {
    test.use(as(organiser))

    test('sees the answers and chooses a time', async ({ page }) => {
      await visit(page, pollUrl)
      await expect(page.getByText('1 yes · 0 if need be · 0 no')).toBeVisible()
      await expect(page.getByRole('table')).toContainText('Ada Available')
      await noViolations(page)
      await page.getByRole('button', { name: 'Choose this time' }).first().click()
      await page.getByRole('dialog').getByRole('button', { name: 'Choose this time' }).click()
      await expect(page.getByText('Chosen', { exact: true })).toBeVisible()
    })

    test('arranges a meeting at the chosen time for the poll\'s people', async ({ page }) => {
      await visit(page, pollUrl)
      await page.getByRole('button', { name: 'Arrange a meeting' }).click()
      const panel = page.getByRole('dialog')
      await expect(panel.getByRole('textbox', { name: /^Title/ })).toHaveValue('Cast reading')
      await panel.getByRole('textbox', { name: /^Place/ }).fill('Studio')
      await noViolations(page)
      await panel.getByRole('button', { name: 'Arrange a meeting' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Cast reading' })).toBeVisible()
      await expect(page.getByText('Studio')).toBeVisible()
    })
  })

  test.describe('a member invited', () => {
    test.use(as(member))

    test('finds the meeting under Asked of me and says they are going', async ({ page }) => {
      await visit(page, '/members/availability/requests')
      await page.getByRole('link', { name: /Cast reading/ }).first().click()
      await expect(page.getByRole('heading', { name: 'Are you going?' })).toBeVisible()
      await noViolations(page)
      await page.getByRole('button', { name: 'Going', exact: true }).click()
      await expect(page.getByText('Answer saved')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Going', exact: true })).toHaveAttribute('aria-pressed', 'true')
    })
  })
})
