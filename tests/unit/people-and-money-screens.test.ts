import { describe, expect, test } from 'bun:test'

// The people and money console screens, read as source: a way back and a skeleton on an
// account's page, a picker for a merge, the claims count in reach, and period controls that ask
// the question themselves (issue 1151 item 10).

const read = (path: string): Promise<string> => Bun.file(path).text()

const ACCOUNT = 'app/pages/people/accounts/[id].vue'
const MEMBERS = 'app/pages/people/members.vue'
const MONEY = 'app/pages/money/index.vue'
const SHOWS = 'app/pages/money/shows.vue'
const REPORTS = 'app/pages/money/reports.vue'
const RECONCILIATION = 'app/pages/money/reconciliation.vue'

const MONEY_SCREENS = [MONEY, SHOWS, REPORTS, RECONCILIATION]

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

  test('a month and a season are each a select, not a number spinner', async () => {
    const dashboard = await read(MONEY)
    expect(dashboard).toContain('monthChoices')
    expect(dashboard).toContain('seasonChoices')
    expect(await read(SHOWS)).toContain('seasonChoices')
  })

  test('no money screen leaves a number spinner on a period control', async () => {
    for (const path of [MONEY, SHOWS]) {
      expect(await read(path)).not.toContain('UInputNumber')
    }
  })
})
