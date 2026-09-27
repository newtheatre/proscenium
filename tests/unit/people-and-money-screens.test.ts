import { describe, expect, test } from 'bun:test'

// The people and money console screens, read as source: a way back, a skeleton, a picker for a
// merge, the claims count in reach, and period controls that ask the question (item 10).

const read = (path: string): Promise<string> => Bun.file(path).text()

const ACCOUNT = 'app/pages/people/accounts/[id].vue'
const MEMBERS = 'app/pages/people/members.vue'
const MONEY = 'app/pages/money/index.vue'
const SHOWS = 'app/pages/money/shows.vue'
const REPORTS = 'app/pages/money/reports.vue'
const BAR_REPORTS = 'app/pages/bar/reports.vue'
const TILL_CLOSE = 'app/components/till/CloseModal.vue'
const FINANCE_PERIOD_FORM = 'app/composables/useFinancePeriodForm.ts'
const RECONCILIATION = 'app/pages/money/reconciliation.vue'
const PERIOD_FORM = 'app/composables/usePeriodForm.ts'
const PERIOD_FIELDS = 'app/components/PeriodFields.vue'

const MONEY_SCREENS = [MONEY, SHOWS, REPORTS, RECONCILIATION]
const OVERVIEW = 'app/pages/admin/index.vue'
const NEEDS_YOU = 'app/components/money/NightsNeedingYou.vue'

// Issue 1362 (K-128): a money screen says a source, a period and a day in words, never as stored.
describe('money screens read in words', () => {
  test('the dashboard names a source and its range in words', async () => {
    const source = await read(MONEY)
    expect(source).toContain('saysEntrySource(')
    expect(source).not.toMatch(/\{\{\s*data\.fromDay\s*\}\}/)
    expect(source).not.toMatch(/=>\s*row\.original\.source\b/)
  })

  test('the reconciliation sheet is headed for what it holds, and the Z is called one on both screens', async () => {
    const source = await read(RECONCILIATION)
    expect(source).not.toContain('Desk, by kind')
    expect(source).toContain('label="Reader total (Z)"')
    expect(source).not.toContain('reader figure')
    expect(await read(TILL_CLOSE)).toContain('label="Reader total (Z)"')
  })
})

// Issue 1360 (I-104 criteria 4 and 5): a night needing a reading is where the Treasurer looks,
// linked to its own reconciliation; a variance is said as the figure is typed; a write-off is a note.
describe('nights needing a reading are listed where the Treasurer looks', () => {
  test('the money dashboard and the overview both carry the linked list', async () => {
    for (const path of [MONEY, OVERVIEW]) expect(await read(path)).toContain('<MoneyNightsNeedingYou')
    const band = await read(NEEDS_YOU)
    expect(band).toContain('reconciliationHref(')
    expect(band).toContain('/api/admin/finance/reconciliation/outstanding')
    expect(band).toContain('viewFinanceReports')
  })

  test('the reconciliation screen reads its night from the address and keeps it there', async () => {
    const source = await read(RECONCILIATION)
    expect(source).toContain('nightFromQuery(route.query.night')
    expect(source).toMatch(/navigateTo\(\{ query: \{ \.\.\.route\.query, night/)
  })

  test('the variance is shown as the figure is typed, and Record waits for a note it needs', async () => {
    const source = await read(RECONCILIATION)
    expect(source).toContain('liveVariance(')
    expect(source).toContain('data-test="live-variance"')
    expect(source).toContain('noteMissing')
    expect(source).toContain('data-test="reader-zero"')
  })

  test('correct, check again and write off are separate actions, and a write-off retypes nothing', async () => {
    const source = await read(RECONCILIATION)
    for (const action of ['correct-reading', 'check-again', 'write-off']) expect(source).toContain(`data-test="${action}"`)
    expect(source).not.toContain('<UCheckbox')
    expect(source).toMatch(/writtenOff: true,\s*note:/)
    expect(source).toMatch(/writtenOff: true,\s*note: [^\n]+\n\s*expectedPence:/)
  })

  test('a figure or a note typed for one night never carries into another', async () => {
    expect(await read(RECONCILIATION)).toMatch(/watch\(night, \(\) => \{[^}]*readerFigure\.value = ''[^}]*writeOffNote\.value = ''/)
  })

  test('the night open on the screen is the only one shown as active in the list', async () => {
    expect(await read(NEEDS_YOU)).toContain('exact-query')
  })

  // Issue 1360: "Open variance £0.00" beside nights with no reading reads as all clear.
  test('the dashboard says how many nights in its range have no reading beside the open variance', async () => {
    const source = await read(MONEY)
    expect(source).toContain('data-test="unreconciled-nights"')
    expect(source).toContain('unreconciledNights')
  })
})

const ENTRIES = 'app/pages/money/entries.vue'
const PERIODS = 'app/pages/money/periods.vue'
const EXPORTS = 'app/pages/money/exports.vue'

// Issue 1361 (I-101, I-105 criterion 3): an entry says what it was and opens on its detail, every
// figure on the dashboard drills down, and no money screen offers a search that searches nothing.
describe('a ledger entry says what it was and opens', () => {
  test('the list carries a What column and a search box it answers', async () => {
    const source = await read(ENTRIES)
    expect(source).toContain('saysEntryWhat(')
    expect(source).toContain('v-model:search="search"')
  })

  test('each row opens its detail in a drawer, named for the entry it opens', async () => {
    const source = await read(ENTRIES)
    expect(source).toContain('<USlideover')
    expect(source).toContain('/api/admin/finance/season/entries/${')
    expect(source).toMatch(/'aria-label': `Open the entry/)
  })

  test('every figure on the dashboard drills down', async () => {
    const source = await read(MONEY)
    for (const figure of ['kind: \'REFUND\'', 'tender: \'COMP\'', 'discounted: true']) expect(source).toContain(figure)
    expect(source).toContain('/money/reconciliation')
    // A revenue row is card takings only, so its entries are too; the source is typed, not cast.
    expect(source).toContain('entriesUrl({ source: row.original.source, tender: \'CARD\' })')
    // An open variance is made of nights, so it opens the list of them, not tonight's page.
    expect(source).toContain('\'#nights-needing-you\'')
    expect(await read(NEEDS_YOU)).toContain('id="nights-needing-you"')
  })

  test('a money screen with nothing to search shows no search box', async () => {
    for (const path of [PERIODS, EXPORTS]) expect(await read(path)).toContain(':searchable="false"')
  })
})

describe('an account says where it was reached from (A-121 criterion 6)', () => {
  test('the page carries the way back to the directory', async () => {
    const source = await read(ACCOUNT)
    expect(source).toContain('data-test="back-to-accounts"')
    expect(source).toContain('/people/accounts')
  })

  test('it draws a skeleton of what is coming rather than nothing', async () => {
    const source = await read(ACCOUNT)
    expect(source).toContain('data-test="account-skeleton"')
    expect(source).toContain('USkeleton')
  })
})

describe('a merge target is chosen, never typed (A-123 criterion 7)', () => {
  test('the merge card uses the shared person picker', async () => {
    const source = await read(ACCOUNT)
    expect(source).toContain('data-test="merge-winner"')
    expect(source).toContain('<PersonPicker')
  })

  test('nothing is matched by an exact address any more', async () => {
    const source = await read(ACCOUNT)
    expect(source).not.toContain('No account matches that email exactly.')
    expect(source).not.toContain('email.toLowerCase() === mergeSearch')
  })
})

describe('the claims queue is visible from the register (A-130 criterion 8)', () => {
  test('the count sits on the toolbar row, not only inside the filter panel', async () => {
    const source = await read(MEMBERS)
    expect(source).toContain('data-test="claims-waiting"')
  })

  test('pressing it puts the register on the queue', async () => {
    const source = await read(MEMBERS)
    expect(source).toContain('AWAITING_RECORD')
  })
})

describe('the period controls ask the question themselves (I-105 criterion 6)', () => {
  test('no money screen carries a Refresh beside inputs that already refetch', async () => {
    for (const path of MONEY_SCREENS) {
      const source = await read(path)
      expect(source).not.toContain('Refresh')
    }
  })

  test('a month and a year are each a select, not a number spinner', async () => {
    expect(await read(MONEY)).toContain('<PeriodFields')
    const form = await read(PERIOD_FORM)
    expect(form).toContain('monthChoices')
    expect(form).toContain('yearChoices(')
    expect(await read(PERIOD_FIELDS)).toMatch(/<USelect\s+v-if="kind === 'MONTH'"\s+v-model="month"/)
  })

  // Issue 1362 (0087): a money screen offers the season, through the one shared set of controls.
  test('revenue by show offers every period, the season included, through the shared controls', async () => {
    const source = await read(SHOWS)
    expect(source).toContain('<PeriodFields')
    expect(source).toContain('useFinancePeriodForm(')
    expect(source).not.toContain('yearChoices(')
    // One loader for the finance screens' terms and seasons, so the two cannot drift apart.
    expect(await read(MONEY)).toContain('useFinancePeriodForm(')
    expect(await read(FINANCE_PERIOD_FORM)).toContain('/api/admin/finance/seasons')
  })

  // Issue 1362 (I-105 criterion 6, F-119): bar reports opens on tonight and asks the question itself.
  test('bar reports opens on tonight, with nothing to press to read it', async () => {
    const source = await read(BAR_REPORTS)
    expect(source).not.toContain('Refresh')
    expect(source).toMatch(/ref<[^>]*>\('NIGHT'\)/)
    expect(source).toContain('currentShowNight()')
    // Tonight keeps growing, so the report reads again whenever the screen is come back to.
    expect(source).toContain('visibilitychange')
  })

  test('no money screen leaves a number spinner on a period control', async () => {
    for (const path of [MONEY, SHOWS, PERIOD_FIELDS]) {
      expect(await read(path)).not.toContain('UInputNumber')
    }
  })
})
