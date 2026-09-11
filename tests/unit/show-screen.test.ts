import { describe, expect, test } from 'bun:test'
import { SHOW_TABS, showTab } from '#shared/utils/show-tabs'

// D-132 criterion 1: the show screen is sections, each its own component, and the page is what
// holds them together. The markers the e2e suites drive are part of that contract.

const PAGE = 'app/pages/box-office/shows/[id].vue'
const SECTIONS = 'app/components/box-office/show'

const read = (path: string): Promise<string> => Bun.file(path).text()

const sectionFiles = ['Details.vue', 'Performances.vue', 'TicketTypes.vue', 'Warnings.vue', 'Sales.vue']

describe('the show screen is split into sections (criterion 1)', () => {
  test('there is a component for every tab, and the tabs name them all', () => {
    expect(SHOW_TABS.map(tab => tab.value)).toEqual(['details', 'performances', 'ticket-types', 'warnings', 'sales'])
    for (const tab of SHOW_TABS) expect(tab.label.length).toBeGreaterThan(0)
  })

  test('each section is a file under the show folder', async () => {
    for (const file of sectionFiles) expect(await Bun.file(`${SECTIONS}/${file}`).exists()).toBe(true)
  })

  test('the page holds the tabs and the show-level actions, not the sections themselves', async () => {
    const source = await read(PAGE)
    expect(source).toContain('<UTabs')
    expect(source).toContain('data-test="show-status"')
    // The forms and the table belong to their sections now, so the page carries neither.
    expect(source).not.toContain('<UTable')
    expect(source).not.toContain('data-test="show-copy"')
    expect(source.split('\n').length).toBeLessThan(320)
  })

  test('every marker the e2e suites drive still exists, in one section or another', async () => {
    const sources = await Promise.all([PAGE, ...sectionFiles.map(file => `${SECTIONS}/${file}`)].map(read))
    const all = sources.join('\n')
    const markers = [
      'show-status', 'show-copy', 'copy-submit', 'performances-table', 'add-performance',
      'performance-form', 'performance-day', 'performance-clock', 'performance-submit',
      'performance-external-url', 'show-warnings', 'show-prices', 'show-sales',
    ]
    for (const marker of markers) expect(all).toContain(marker)
  })
})

describe('an unknown tab falls back rather than rendering nothing', () => {
  test('a missing or misspelt tab is the details section', () => {
    expect(showTab(undefined)).toBe('details')
    expect(showTab('nonsense')).toBe('details')
    expect(showTab('sales')).toBe('sales')
  })
})
