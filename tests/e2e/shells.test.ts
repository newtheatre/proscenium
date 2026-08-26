import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { openView, skipReason, startApp } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
let app: AppUnderTest

beforeAll(async () => {
  if (skip) return
  app = await startApp()
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

async function inspect<T>(path: string, script: string): Promise<T> {
  const view = await openView()
  try {
    await view.navigate(`${app.baseURL}${path}`)
    return await view.evaluate<T>(script)
  }
  finally {
    view.close()
  }
}

const KIT_COUNTS = `(() => ({
  marquee: document.querySelectorAll('.nnt-marquee').length,
  sticker: document.querySelectorAll('.nnt-sticker').length,
  spotlight: document.querySelectorAll('.nnt-spotlight').length,
}))()`

describe.skipIf(skip !== null)('the three shells (docs/design-language.md)', () => {
  // Stage black in both colour modes, done by marking the subtree rather than overriding slot
  // classes: every token inside then resolves to its dark value on its own.
  test('the public chrome is stage black while the page is not', async () => {
    const seen = await inspect<{ subtree: string, root: string, header: string }>('/', `(() => {
      const wrapper = document.querySelector('.dark')
      const header = document.querySelector('header')
      return {
        subtree: getComputedStyle(wrapper).getPropertyValue('--ui-bg').trim(),
        root: getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim(),
        header: getComputedStyle(header).backgroundColor,
      }
    })()`)
    expect(seen.subtree).toContain('oklch')
    expect(seen.header).toBe(seen.subtree)
    expect(seen.root).not.toBe(seen.subtree)
  })

  // At most one marquee CTA, one sticker and one spotlight per view. The budget is a rule and
  // not a suggestion, so it is a test rather than a habit.
  test('a public view spends its expressive budget at most once each', async () => {
    for (const path of ['/', '/sign-in']) {
      const counts = await inspect<Record<string, number>>(path, KIT_COUNTS)
      for (const [element, count] of Object.entries(counts)) {
        expect(`${path} ${element}: ${count <= 1}`).toBe(`${path} ${element}: true`)
      }
    }
  })

  // Internal tools use the calm defaults only. No poster kit in admin.
  test('the admin shell uses none of the expressive kit', async () => {
    expect(await inspect<Record<string, number>>('/admin', KIT_COUNTS))
      .toEqual({ marquee: 0, sticker: 0, spotlight: 0 })
  })

  test('the show-night shell is a dark subtree, not a dashboard', async () => {
    const seen = await inspect<{ bg: string, dashboard: number }>('/foh', `(() => ({
      bg: getComputedStyle(document.querySelector('.dark')).backgroundColor,
      dashboard: document.querySelectorAll('[class*="dashboard"]').length,
    }))()`)
    expect(seen.bg).toContain('oklch')
    expect(seen.dashboard).toBe(0)
  })

  // The Google route refuses with a code; the wording lives on the page that shows it, so an
  // unhandled code would leave a member staring at nothing.
  test('every refusal code the Google route can send is explained', async () => {
    for (const code of ['not-workspace', 'unverified-email', 'disabled', 'linked-elsewhere', 'google']) {
      const text = await inspect<string>(`/sign-in?refused=${code}`, 'document.body.innerText')
      expect(`${code}: ${text.length > 40 && !text.includes('undefined')}`).toBe(`${code}: true`)
    }
  })
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
