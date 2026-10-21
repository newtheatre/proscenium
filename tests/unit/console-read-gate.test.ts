import { describe, expect, test } from 'bun:test'

// A refused or failed read is shown in place of the screen's work, never above an empty list with
// its create button still live (0119).

// Screens whose work is not one read: a catch-all redirect, a form with nothing to list, the
// overview and the reports, whose sections each say their own failure in place, and /dev.
const NOT_ONE_READ = [
  'app/pages/admin/[...legacy].vue',
  'app/pages/admin/index.vue',
  'app/pages/rota/manage/age-checks.vue',
  'app/pages/bar/products/new.vue',
  'app/pages/comms/announce.vue',
  'app/pages/reports/index.vue',
  'app/pages/dev.vue',
]

// A screen whose one read lives in the table component it draws: the gate is that component's.
const GATED_IN: Record<string, { tag: string, component: string }> = {
  'app/pages/training/manage/index.vue': { tag: '<TrainingCatalogueTable', component: 'app/components/training/CatalogueTable.vue' },
}

async function consolePages(): Promise<{ path: string, source: string }[]> {
  const found: { path: string, source: string }[] = []
  for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: 'app/pages', onlyFiles: true })) {
    const path = `app/pages/${entry}`
    const source = await Bun.file(path).text()
    if (source.includes('layout: \'console\'')) found.push({ path, source })
  }
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

describe('a console screen whose read failed shows the failure instead of its work', () => {
  test('every console screen that reads something wraps its work in ReadGate', async () => {
    const missing = (await consolePages())
      .filter(page => !NOT_ONE_READ.includes(page.path) && !(page.path in GATED_IN))
      .filter(page => !page.source.includes('<ReadGate'))
      .map(page => page.path)
    expect(missing).toEqual([])
  })

  test('a screen whose read lives in its table component is gated there', async () => {
    for (const [page, { tag, component }] of Object.entries(GATED_IN)) {
      expect(await Bun.file(page).text()).toContain(tag)
      expect(await Bun.file(component).text()).toContain('<ReadGate')
    }
  })

  test('the exemptions are console screens that still exist', async () => {
    const paths = (await consolePages()).map(page => page.path)
    expect(NOT_ONE_READ.filter(path => !paths.includes(path))).toEqual([])
  })

  test('the gate draws the failure in place of the work, unless the question itself was refused', async () => {
    const source = await Bun.file('app/components/ReadGate.vue').text()
    expect(source).toContain('v-if="failure"')
    expect(source).toContain('<slot v-if="!failure || asked" />')
    expect(source).toContain('props.failure?.status === 400 || props.failure?.status === 422')
  })

  test('no gated screen still says a refusal in its empty state', async () => {
    const offenders = (await consolePages())
      .filter(page => /[fF]ailure\s*\?\s*[a-zA-Z]*[fF]ailure\.message\s*:/.test(page.source))
      .map(page => page.path)
    expect(offenders).toEqual([])
  })
})

describe('a refusal is not something trying again can mend', () => {
  test('a failure carries its status, so the alert can tell a refusal from a dropped read', async () => {
    const source = await Bun.file('app/composables/useListFailure.ts').text()
    expect(source).toContain('status: refusalStatus(error)')
  })

  test('a dropped connection keeps Try again', async () => {
    const source = await Bun.file('app/components/ReadFailure.vue').text()
    expect(source).toContain('failure.status !== 403')
  })
})
