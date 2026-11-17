// The inbox (C-30) in a real browser: the bell in the header shows the unread count of the audience
// side and leads to My account's Inbox; opening a message marks it read and follows its link; "Mark
// all read" clears the bell; archiving offers Undo; the members' side is never mixed in. The
// messages are written straight into the local database, as a sending module would leave them.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const reader = { kind: 'person', accountId: `acc_inboxreader${Date.now() % 1_000_000}`, name: 'Ines Inbox', assurance: 'strong', reassertedAt: Date.now(), grants: [] }
const as = (actor: object) => ({ extraHTTPHeaders: { 'x-test-actor': JSON.stringify(actor) } })
const output = fileURLToPath(new URL('../../.output', import.meta.url))

async function visit(page: Page, url: string) {
  await page.goto(url)
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}
const noViolations = async (page: Page) => {
  await page.mouse.move(0, 0)
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([])
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  const now = Date.now()
  const row = (n: number, side: string, title: string, body: string, link: string | null, ago: number) =>
    `('inb_e2e${String(now % 1_000_000).padStart(6, '0')}${String(n).padStart(13, '0')}', '${reader.accountId}', '${side}', '${title}', '${body}', ${link ? `'${link}'` : 'NULL'}, ${now + 86_400_000}, ${now - ago})`
  const values = [
    row(1, 'audience', 'Your tickets are reserved', 'Pay at the box office when you arrive.', '/account/details', 3000),
    row(2, 'audience', 'Your booking was changed', 'One ticket was cancelled.', null, 2000),
    row(3, 'members', 'Your shift has a new time', 'Please arrive by 7pm.', '/members/front-of-house', 1000),
  ].join(', ')
  execFileSync('bunx', ['wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', '../.wrangler/e2e', '--config', 'server/wrangler.json',
    '--command', `INSERT INTO core_inbox_items (id, account_id, side, title, body, link, expires_at, created_at) VALUES ${values}`], { cwd: output, stdio: 'pipe' })
})

test.describe('someone with messages', () => {
  test.use(as(reader))

  test('sees the unread count on the bell and reads the audience side only', async ({ page }) => {
    await visit(page, '/')
    const bell = page.getByRole('link', { name: 'Inbox, 2 unread messages' })
    await expect(bell).toBeVisible()
    await bell.click()
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
    const list = page.getByRole('list', { name: 'Inbox' })
    await expect(list.getByRole('listitem')).toHaveCount(2)
    await expect(list.getByRole('listitem').first()).toContainText('Your booking was changed')
    await expect(page.getByText('Your shift has a new time')).toHaveCount(0)
    await noViolations(page)
  })

  test('opens a message, which marks it read and follows its link', async ({ page }) => {
    await visit(page, '/account/inbox')
    await page.getByRole('button', { name: 'Unread: Your tickets are reserved' }).click()
    await expect(page).toHaveURL(/\/account\/details$/)
    await expect(page.getByRole('link', { name: 'Inbox, 1 unread message' })).toBeVisible()
  })

  test('archives one with Undo, and marks the rest read', async ({ page }) => {
    await visit(page, '/account/inbox')
    await page.getByRole('button', { name: 'Archive Your tickets are reserved' }).click()
    const toasts = page.getByRole('region', { name: /Notifications/ })
    await expect(toasts.getByText('Archived Your tickets are reserved')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Inbox' }).getByRole('listitem')).toHaveCount(1)
    await toasts.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByRole('list', { name: 'Inbox' }).getByRole('listitem')).toHaveCount(2)

    await page.getByRole('button', { name: 'Mark all read' }).click()
    await expect(page.getByRole('link', { name: 'Inbox', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Archived' }).click()
    await expect(page.getByText('Nothing archived')).toBeVisible()
  })
})

test('someone with no messages is told so, and a visitor has no bell', async ({ browser }) => {
  const context = await browser.newContext(as({ ...reader, accountId: 'acc_nomessages' }))
  const page = await context.newPage()
  await visit(page, '/account/inbox')
  await expect(page.getByText('No messages')).toBeVisible()
  await noViolations(page)
  await context.close()
  const visitor = await browser.newPage()
  await visit(visitor, '/')
  await expect(visitor.getByRole('link', { name: /^Inbox/ })).toHaveCount(0)
  await visitor.close()
})
