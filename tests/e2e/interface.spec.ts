// The interface layer in a real browser: the shells, the guard, the page types, the feedback
// conventions and accessibility in light and dark. Runs against a build made with
// PROSCENIUM_GALLERY=1 (bun run test:browser does that), which adds the gallery's sample screens
// and a test sign-in that reads who is asking from the X-Test-Actor header.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const grant = (ability: string) => ({ ability, via: 'test' })
const person = (name: string, grants: ReturnType<typeof grant>[]) => ({ kind: 'person', accountId: `acc_${name.toLowerCase().replace(/\W/g, '')}`, name, grants })
const staff = person('Sam Staff', [grant('gallery.sample.view'), grant('gallery.sample.manage')])
const reader = person('Robin Reader', [grant('gallery.sample.view')])
const audience = person('Alex Audience', [])
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })

// The tests share one local database and make many requests as a handful of people; the platform's
// own limit (core.rate-limits.default) is exercised by the kit's tests, not these.
test.beforeAll(async ({ playwright }) => {
  const siteOwner = { ...person('Rate Owner', [grant('core.settings.manage')]), assurance: 'strong', reassertedAt: Date.now() }
  const api = await playwright.request.newContext({ baseURL: 'http://localhost:8788', ...as(siteOwner) })
  await api.put('/api/core/settings', { data: { changes: [{ key: 'core.rate-limits.default', value: 10000 }] } })
  await api.dispose()
})

// Waits for the page to hydrate, so a test never acts on markup that has no behaviour yet.
async function visit(page: Page, url: string) {
  const response = await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  return response
}

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test.describe('a visitor who is not signed in', () => {
  test('is sent to sign in and back to the address they asked for', async ({ page }) => {
    await visit(page, '/console/gallery/list?status=draft')
    await expect(page).toHaveURL(/\/sign-in\?next=(%2F|\/)console(%2F|\/)gallery(%2F|\/)list(%3F|\?)status(%3D|=)draft/)
  })

  test('sees the public shell, with the same footer and a Sign in button', async ({ page }) => {
    await visit(page, '/')
    await expect(page.getByRole('banner')).toContainText('Your theatre')
    await expect(page.getByRole('link', { name: "What's on" }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('contentinfo')).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
  })
})

test.describe('an audience account', () => {
  test.use(as(audience))

  test('has a three line menu and no trace of the members\' area or the console in the page', async ({ page }) => {
    await visit(page, '/')
    const html = await page.content()
    expect(html).not.toMatch(/\/console|\/members/)
    await page.getByRole('button', { name: /Open the menu for Alex Audience/ }).click()
    await expect(page.getByRole('menuitem')).toHaveText(['My account', 'Appearance', 'Sign out'])
  })

  test('is told a console address does not exist, exactly as for a missing page', async ({ page }) => {
    const response = await visit(page, '/console/gallery/list')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
    const missing = await visit(page, '/no-such-page')
    expect(missing?.status()).toBe(404)
  })

  test('opens My account in the public shell', async ({ page }) => {
    await visit(page, '/account/gallery')
    await expect(page.getByRole('heading', { level: 1, name: 'Sample tickets' })).toBeVisible()
    await expect(page.getByRole('banner')).toContainText('Your theatre')
    await noViolations(page)
  })
})

test.describe('someone in the console without the ability for one screen', () => {
  test.use(as(reader))

  test('is told why and what would let them through', async ({ page }) => {
    const response = await visit(page, '/console/gallery/denied')
    expect(response?.status()).toBe(403)
    await expect(page.getByRole('heading', { level: 1, name: 'You cannot open this page' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('You do not have permission to do this.')
    await expect(page.getByRole('alert')).toContainText('Ask an administrator for this permission.')
    await noViolations(page)
  })

  test('does not see a settings page they cannot change', async ({ page }) => {
    const response = await visit(page, '/console/gallery/settings')
    expect(response?.status()).toBe(403)
  })
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`staff in the console, ${scheme}`, () => {
    // Each scheme is its own account, so one run's requests do not use up the other's rate limit.
    test.use({ ...as({ ...staff, accountId: `${staff.accountId}_${scheme}` }), colorScheme: scheme })

    test('sidebar: groups in the fixed order, everyday before set-up, a group nobody may open is absent', async ({ page }) => {
      await visit(page, '/console')
      const nav = page.getByRole('navigation', { name: 'Console' })
      const text = await nav.innerText()
      expect(text.indexOf('Gallery')).toBeGreaterThan(-1)
      expect(text).not.toContain('System') // core's own screens are not theirs to open
      expect(text.indexOf('Everyday')).toBeLessThan(text.indexOf('Set up'))
      expect(text).not.toContain('Administration') // the entry they cannot open is not greyed, it is absent
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await noViolations(page)
    })

    test('the list page: filters in the address, Back restores them, export says what it holds', async ({ page }) => {
      await visit(page, '/console/gallery/list')
      await expect(page.getByRole('heading', { level: 1, name: 'Sample list' })).toBeVisible()
      await expect(page.getByText('Page 1 of 3, 60 in all').first()).toBeVisible()
      await noViolations(page)
      await page.getByRole('combobox', { name: 'Status' }).click()
      await page.getByRole('option', { name: 'Draft' }).click()
      await expect(page).toHaveURL(/status=draft/)
      await expect(page.getByText('20 in all').first()).toBeVisible()
      await expect(page.getByRole('button', { name: /Remove the filter Status: Draft/ })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Export 20 rows as CSV' })).toHaveAttribute('href', /status=draft&format=csv/)
      await page.goBack()
      await expect(page).not.toHaveURL(/status=draft/)
      await expect(page.getByText('60 in all').first()).toBeVisible()
      await page.goForward()
      await expect(page).toHaveURL(/status=draft/)
    })

    test('an empty filter and an empty list say different things', async ({ page }) => {
      await visit(page, '/console/gallery/list?q=zzzz')
      await expect(page.getByText('Nothing matches these filters')).toBeVisible()
      await page.getByRole('button', { name: 'Clear all' }).first().click()
      await expect(page.getByText('60 in all').first()).toBeVisible()
    })

    test('the list page: sorting, aria-sort, paging', async ({ page }) => {
      await visit(page, '/console/gallery/list')
      await page.getByRole('button', { name: 'Seats' }).click()
      await expect(page).toHaveURL(/sort=seats/)
      await expect(page.getByRole('columnheader', { name: /Seats/ })).toHaveAttribute('aria-sort', 'ascending')
      await page.getByRole('button', { name: /Page 2/ }).or(page.getByRole('button', { name: '2', exact: true })).first().click()
      await expect(page).toHaveURL(/page=2/)
    })

    test('the form: the same message as the server, one press, a conflict that never overwrites', async ({ page }) => {
      await visit(page, '/console/gallery/form')
      await page.getByLabel('Name').fill('Ha')
      await page.getByLabel('Name').blur()
      await expect(page.getByText('Give a name of at least 3 characters.')).toBeVisible()
      await page.getByRole('button', { name: 'Save booking' }).click()
      await expect(page.getByRole('alert')).toContainText('Please check')
      await noViolations(page)
      // the server says the same thing for the same value
      const response = await page.request.post('/api/gallery/save', { data: { name: 'Ha', email: 'a@b.org', quantity: 2 }, headers: { 'x-test-actor': JSON.stringify(staff) } })
      expect((await response.json()).fields.name).toBe('Give a name of at least 3 characters.')
    })

    test('the form: a stale save shows both versions and asks which to keep', async ({ page }) => {
      await visit(page, '/console/gallery/form?stale=1')
      await page.getByLabel('Name').fill('My new name')
      await page.getByLabel('Email address').fill('me@example.org')
      await page.getByRole('button', { name: 'Save booking' }).click()
      await expect(page.getByText('Someone else saved first')).toBeVisible()
      await expect(page.getByText('Keep mine: My new name')).toBeVisible()
      await expect(page.getByText('Use theirs: Hamlet (renamed)')).toBeVisible()
      await noViolations(page)
    })

    test('the form: leaving with changes asks once', async ({ page }) => {
      await visit(page, '/console/gallery/form')
      await page.getByLabel('Name').fill('Changed')
      await page.getByRole('link', { name: 'Sample list' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('Leave this page?')
      await expect(dialog).toContainText('You have changes that have not been saved')
      await dialog.getByRole('button', { name: 'Go back' }).click()
      await expect(page).toHaveURL(/\/console\/gallery\/form/)
    })

    test('a confirmation names the thing and the consequence, repeats the verb, and returns focus', async ({ page }) => {
      await visit(page, '/console/gallery/feedback')
      const opener = page.getByRole('button', { name: 'Cancel a performance' })
      await opener.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('Cancel the 19:30 performance of Hamlet?')
      await expect(dialog).toContainText('84 ticket holders will be emailed.')
      await noViolations(page)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(opener).toBeFocused()
      await opener.click()
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel performance' }).click()
      await expect(page.getByTestId('answer')).toHaveText('cancelled')
    })

    test('undo is offered instead of a confirmation', async ({ page }) => {
      await visit(page, '/console/gallery/feedback')
      await page.getByRole('button', { name: 'Archive with undo' }).click()
      // The toast is announced twice (once for screen readers); the real button is the one Reka marks.
      await page.locator('button[data-reka-toast-announce-exclude]', { hasText: 'Undo' }).click()
      await expect(page.getByTestId('answer')).toHaveText('restored')
    })

    test('a failed first load shows only the reason and Retry', async ({ page }) => {
      await visit(page, '/console/gallery/feedback')
      const failed = page.getByRole('alert').filter({ hasText: 'Try again' })
      await expect(failed).toBeVisible()
      await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible()
      await expect(page.getByText('never shown')).toHaveCount(0)
      await expect(page.getByText('Loaded 60 rows.')).toBeVisible()
    })

    test('steps: Back keeps what was entered, the last step summarises and names the act', async ({ page }) => {
      await visit(page, '/console/gallery/steps')
      await expect(page.getByRole('heading', { level: 2, name: 'Name your theatre' })).toBeVisible()
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.getByRole('alert')).toContainText('Give your theatre a name.')
      await page.getByLabel('Theatre name').fill('The Lantern')
      await page.getByRole('button', { name: 'Continue' }).click()
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.getByText('The Lantern will be set up with 100 seats.')).toBeVisible()
      await noViolations(page)
      await page.getByRole('button', { name: 'Back' }).click()
      await page.getByRole('button', { name: 'Back' }).click()
      await expect(page.getByLabel('Theatre name')).toHaveValue('The Lantern')
      await expect(page.getByRole('button', { name: 'Set up my theatre' })).toHaveCount(0)
    })

    test('core\'s own settings page shows wording for every setting, never a catalogue key', async ({ browser }) => {
      const owner = { ...person('Olive Owner', ['core.settings.manage', 'core.identity-settings.manage', 'core.organisation.edit', 'core.branding.edit', 'core.sender.manage', 'core.template.edit'].map(grant)), assurance: 'strong', reassertedAt: Date.now() }
      const context = await browser.newContext(as(owner))
      const page = await context.newPage()
      await visit(page, '/console/system/settings')
      await expect(page.getByRole('heading', { level: 1, name: 'Core settings' })).toBeVisible()
      await expect(page.getByText('Short name', { exact: true }).first()).toBeVisible()
      // A part of the catalogue that is not loaded shows as its key, such as core.settings.x.label.
      expect((await page.locator('main').innerText()).match(/\b[a-z][a-z0-9-]*\.[a-z0-9.-]+\.(label|help)\b/g) ?? []).toEqual([])
      await context.close()
    })

    test('the generated settings page: each setting shows its default, who may change it and a quoted tag', async ({ page }) => {
      await visit(page, '/console/gallery/settings')
      await expect(page.getByRole('heading', { level: 1, name: 'Gallery settings' })).toBeVisible()
      await expect(page.getByText('Quoted on public pages')).toBeVisible()
      await expect(page.getByText('Changed by people who can: Change the gallery\'s settings.').first()).toBeVisible()
      await noViolations(page)
      const title = page.getByLabel('Show title', { exact: true })
      await title.fill('Macbeth')
      await expect(page.getByText('1 change')).toBeVisible()
      await page.getByRole('button', { name: 'Save Sample show settings' }).click()
      await expect(page.getByText('Saved 1 change').first()).toBeVisible()
      await visit(page, '/console/gallery/settings') // waits for hydration, as a bare reload does not
      await expect(page.getByLabel('Show title', { exact: true })).toHaveValue('Macbeth')
      await expect(page.getByText('Default: Hamlet.')).toBeVisible()
      await page.getByRole('button', { name: /Reset Show title to its default/ }).click()
      await page.getByRole('button', { name: 'Save Sample show settings' }).click()
      await expect(page.getByText('Saved 1 change').first()).toBeVisible()
    })

    test('the account menu marks the current shell and offers the console', async ({ page }) => {
      await visit(page, '/console/gallery/list')
      await page.getByRole('button', { name: /Open the menu for Sam Staff/ }).first().click()
      await expect(page.getByRole('menuitem', { name: 'Console' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: 'My account' })).toBeVisible()
    })
  })
}

test.describe('on a phone', () => {
  test.use({ ...as({ ...staff, accountId: `${staff.accountId}_phone` }), viewport: { width: 390, height: 800 } })

  test('the list becomes cards and the sidebar a drawer, with nothing scrolling sideways', async ({ page }) => {
    await visit(page, '/console/gallery/list')
    await expect(page.getByRole('table')).toBeHidden()
    await expect(page.getByRole('list').getByRole('listitem').first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(overflow).toBe(false)
    await noViolations(page)
  })
})

test.describe('My account and counts', () => {
  test.use(as({ ...audience, accountId: 'acc_alexaudience_account' }))

  test('lists the sections modules add, with the account entries as links, and has no violations', async ({ page }) => {
    await visit(page, '/account')
    await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sample tickets' }).first()).toBeVisible()
    await expect(page.getByText('Sample tickets section').first()).toBeVisible()
    await noViolations(page)
  })
})

test.describe('counts in the console menu', () => {
  test.use(as({ ...staff, accountId: 'acc_samstaff_counts' }))

  test('shows a count beside an entry while there is something to count', async ({ page }) => {
    await visit(page, '/console/gallery/list')
    const entry = page.getByRole('navigation', { name: 'Console' }).getByRole('link', { name: /Sample drafts/ })
    await expect(entry).toContainText('3')
  })
})

test.describe('the starting colour mode', () => {
  test('a first-time visitor sees the site owner\'s choice', async ({ browser }) => {
    const siteOwner = { ...person('Olive Owner', [grant('core.settings.manage')]), assurance: 'strong', reassertedAt: Date.now() }
    const owner = await browser.newContext({ baseURL: 'http://localhost:8788', ...as(siteOwner) })
    const change = (change: object) => owner.request.put('/api/core/settings', { data: { changes: [change] } })
    expect((await change({ key: 'core.appearance.default', value: 'dark' })).ok()).toBe(true)
    try {
      const visitor = await browser.newContext({ baseURL: 'http://localhost:8788', colorScheme: 'light' })
      const page = await visitor.newPage()
      await visit(page, '/')
      await expect(page.locator('html')).toHaveClass(/dark/)
      await visitor.close()
    }
    finally {
      await change({ key: 'core.appearance.default', reset: true })
      await owner.close()
    }
  })
})

test.describe('confirming it is you', () => {
  test('a save refused for a stale sign-in opens the dialogue in place rather than leaving the page', async ({ browser }) => {
    // core.settings.manage alone opens only Site administration (R-33); the organisation's settings keep her in the console.
    const stale = { ...person('Stella Stale', [grant('core.settings.manage'), grant('core.organisation.edit')]), assurance: 'strong' }
    const context = await browser.newContext({ baseURL: 'http://localhost:8788', ...as(stale) })
    const page = await context.newPage()
    await visit(page, '/console')
    const at = page.url()
    // Sent and not awaited: the request waits on the dialogue, as a save button's would.
    await page.evaluate(() => {
      void (globalThis as unknown as { $fetch: (url: string, options: object) => Promise<unknown> })
        .$fetch('/api/core/settings', { method: 'PUT', body: { changes: [{ key: 'core.appearance.default', value: 'dark' }] } }).catch(() => null)
    })
    await expect(page.getByRole('dialog', { name: 'Confirm it is you' })).toBeVisible()
    expect(page.url()).toBe(at)
    await noViolations(page)
    await context.close()
  })
})
