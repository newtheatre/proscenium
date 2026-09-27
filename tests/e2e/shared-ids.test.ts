import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { adminSession } from '#tests/helpers/accounts'
import { click, fillDate, openView, pickOption, skipReason, startApp, visit, waitFor } from '#tests/helpers/webview'
import type { AppUnderTest } from '#tests/helpers/webview'
import type { TestMember } from '#tests/helpers/accounts'

// Every control inside one UFormField takes the field's id, so a group of them shares one id and
// one label, and a label's tap lands on the first (K-101, as issue 1333 found for the access needs).

const skip = skipReason()
const BOOT_TIMEOUT_MS = 180_000
const CASE_TIMEOUT_MS = 120_000
let app: AppUnderTest
let officer: TestMember

beforeAll(async () => {
  if (skip) return
  app = await startApp()
  officer = await adminSession(app)
}, BOOT_TIMEOUT_MS)

afterAll(async () => {
  await app?.stop()
}, 30_000)

async function signedIn(): Promise<Bun.WebView> {
  const view = await openView()
  await view.navigate(`${app.baseURL}/`)
  await waitFor(view, 'document.body')
  await view.evaluate(`document.cookie = ${JSON.stringify(officer.cookie)}`)
  return view
}

interface Naming { duplicated: string[], named: Record<string, string> }

// The ids repeated inside the scope, and the name each named control is announced with: its
// aria-label, what aria-labelledby points at, or the labels that point at it.
async function naming(view: Bun.WebView, scope: string, controls: string): Promise<Naming> {
  return JSON.parse(await view.evaluate<string>(`(() => {
    const root = document.querySelector(${JSON.stringify(scope)})
    const ids = [...root.querySelectorAll('[id]')].map(element => element.id)
    const duplicated = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
    const nameOf = control => (control.getAttribute('aria-label')
      || (control.getAttribute('aria-labelledby') ?? '').split(' ').map(id => document.getElementById(id)?.innerText ?? '').join(' ')
      || [...(control.labels ?? [])].map(label => label.innerText).join(' ')).trim()
    const named = Object.fromEntries([...root.querySelectorAll(${JSON.stringify(controls)})]
      .map(control => [control.dataset.test, nameOf(control)]))
    return JSON.stringify({ duplicated, named })
  })()`)) as Naming
}

function expectOwnNames(found: Naming, count: number): void {
  expect(found.duplicated).toEqual([])
  const names = Object.values(found.named)
  expect(names.length).toBe(count)
  expect(names.filter(name => !name)).toEqual([])
  expect(new Set(names).size).toBe(names.length)
}

describe.skipIf(skip !== null)('a group of controls gives each one its own id and name (K-101)', () => {
  test('the console filters: sort field and order, and a condition\'s operator and value', async () => {
    const view = await signedIn()
    try {
      await visit(view, `${app.baseURL}/box-office/shows`, '[data-test="shows-table"]')
      await click(view, '[data-test="toolbar-filters"]')
      await waitFor(view, `document.querySelector('[data-test="filter-status-operator"]')`)
      await pickOption(view, '[data-test="filter-status-operator"]', 'Is')
      await waitFor(view, `document.querySelector('[data-test="filter-status-value"]')`)

      const found = await naming(view, '[data-test="console-filters"]',
        '[data-test="list-sort"], [data-test="list-direction"], [data-test="filter-status-operator"], [data-test="filter-status-value"]')
      expectOwnNames(found, 4)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  // The message shows once, under the condition; both dates it is about are marked invalid by it.
  test('a range that runs backwards marks both of its dates invalid', async () => {
    const view = await signedIn()
    try {
      await visit(view, `${app.baseURL}/admin/audit`, '[data-test="audit-table"]')
      await click(view, '[data-test="toolbar-filters"]')
      await waitFor(view, `document.querySelector('[data-test="filter-createdAt-operator"]')`)
      await pickOption(view, '[data-test="filter-createdAt-operator"]', 'Between')
      await waitFor(view, `document.querySelector('[data-test="filter-createdAt-to"]')`)
      await fillDate(view, '[data-test="filter-createdAt-value"]', '2026-09-20')
      await fillDate(view, '[data-test="filter-createdAt-to"]', '2026-09-10')

      await waitFor(view, `document.querySelector('[data-test="console-filters"]').innerText.includes('Runs backwards')`)
      const invalid = await view.evaluate<string>(`JSON.stringify(['value', 'to'].map(end =>
        document.querySelector('[data-test="filter-createdAt-' + end + '"]')?.getAttribute('aria-invalid')))`)
      expect(JSON.parse(invalid)).toEqual(['true', 'true'])
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the module editor: each material link\'s words and address', async () => {
    const view = await signedIn()
    try {
      await visit(view, `${app.baseURL}/training/manage`, '[data-test="add-module"]')
      await click(view, '[data-test="add-module"]')
      await waitFor(view, `document.querySelector('[data-test="add-material"]')`)
      await click(view, '[data-test="add-material"]')
      await click(view, '[data-test="add-material"]')
      await waitFor(view, `document.querySelector('[data-test="material-url-1"]')`)

      const found = await naming(view, '[data-test="module-form"]',
        '[data-test^="material-label-"], [data-test^="material-url-"], [data-test^="remove-material-"]')
      expectOwnNames(found, 6)
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)

  test('the pass type form: each price point\'s label and price', async () => {
    const view = await signedIn()
    try {
      await visit(view, `${app.baseURL}/box-office/pass-types`, '[data-test="add-pass-type"]')
      await click(view, '[data-test="add-pass-type"]')
      await waitFor(view, `document.querySelector('[data-test="pass-type-add-price"]')`)
      await click(view, '[data-test="pass-type-add-price"]')
      await waitFor(view, `document.querySelector('[data-test="pass-type-price-amount-1"]')`)

      const found = await naming(view, '[data-test="pass-type-form"]',
        '[data-test^="pass-type-price-label-"], [data-test^="pass-type-price-amount-"], [data-test^="pass-type-remove-price-"]')
      expectOwnNames(found, 6)

      // The hint under the legend is read with each price row's inputs, as the field's description was.
      const described = await view.evaluate<string>(`JSON.stringify([...document.querySelectorAll(
        '[data-test^="pass-type-price-label-"], [data-test^="pass-type-price-amount-"]')]
        .map(input => document.getElementById(input.getAttribute('aria-describedby') ?? '')?.innerText.trim() ?? ''))`)
      expect(new Set(JSON.parse(described) as string[])).toEqual(new Set(['At least one, each with its own label.']))
    }
    finally {
      view.close()
    }
  }, CASE_TIMEOUT_MS)
})

if (skip) console.warn(`[e2e] skipped: ${skip}`)
