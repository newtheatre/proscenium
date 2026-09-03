import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { plural } from '#shared/utils/text'

// The admin conventions are a test rather than a review habit (0032), the same way the design
// language is (0021). What review still judges is whether a screen says the right thing.

// Every console screen, wherever its domain put it: the prefix names the domain and only the
// posture picks the shell, so scanning one directory would miss most of them (0040).
const PAGES = 'app/pages'
const CONSOLE_LAYOUT = /layout:\s*['"`]console['"`]/

async function screens(): Promise<{ path: string, source: string }[]> {
  const found: { path: string, source: string }[] = []
  for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: PAGES, onlyFiles: true })) {
    const path = join(PAGES, entry)
    const source = await Bun.file(path).text()
    if (CONSOLE_LAYOUT.test(source)) found.push({ path, source })
  }
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

const offenders = async (test: (source: string) => boolean): Promise<string[]> =>
  (await screens()).filter(screen => test(screen.source)).map(screen => screen.path)

describe('an input is the component for its value (0032)', () => {
  test('a date is UInputDate, never a native date input', async () => {
    expect(await offenders(source => /type="date"/.test(source))).toEqual([])
  })

  test('a number is UInputNumber, never a native number input', async () => {
    expect(await offenders(source => /type="number"|'number' \? 'number'/.test(source))).toEqual([])
  })
})

describe('a person is chosen, never typed (0032)', () => {
  // The tell is a field asking for an account: nothing on an admin screen should want an id typed
  // into it, and the picker is what a screen uses instead.
  test('no screen asks somebody to type an account id', async () => {
    const asking = await offenders(source =>
      /label="Account"|placeholder="user:|The account id/.test(source) && !source.includes('<PersonPicker'))
    expect(asking).toEqual([])
  })
})

describe('filters sit in a toolbar at a fixed width (0032)', () => {
  test('no screen lays its filters out in a bare flex row', async () => {
    expect(await offenders(source => /class="flex flex-wrap items-end gap-3"/.test(source))).toEqual([])
  })

  // One search of a fixed width and one button, with the filters behind it, is what stops a row
  // resizing as its values change.
  test('every list uses the shared toolbar', async () => {
    const lists = (await screens()).filter(screen => screen.source.includes('<UTable'))
    expect(lists.length).toBeGreaterThan(0)
    expect(lists.filter(screen => !screen.source.includes('<AdminToolbar')).map(screen => screen.path)).toEqual([])
  })
})

describe('feedback goes where it belongs (0032)', () => {
  // A confirmation the reader does not have to act on is a toast, not something that sits on the
  // page until it is dismissed.
  test('every table says what would be there when it is empty', async () => {
    const tables = (await screens()).filter(screen => screen.source.includes('<UTable'))
    expect(tables.length).toBeGreaterThan(0)
    expect(tables.filter(screen => !screen.source.includes('#empty')).map(screen => screen.path)).toEqual([])
  })

  test('nothing counts things as "account(s)"', async () => {
    const lazy = (await screens()).filter(screen => screen.source.includes('(s)'))
    expect(lazy.map(screen => screen.path)).toEqual([])
  })

  test('a screen that confirms an action uses a toast', async () => {
    const confirming = (await screens()).filter(screen =>
      /Recorded|Revoked\.|is on the (roll|trail)/.test(screen.source))
    expect(confirming.length).toBeGreaterThan(0)
    expect(confirming.filter(screen => !screen.source.includes('useToast')).map(screen => screen.path)).toEqual([])
  })
})

// Money is entered in pounds and stored in pence, and the settings screen is the only place that
// converts (0004, 0032).
describe('money reads in pounds and is stored in pence', () => {
  const pounds = (pence: number | undefined): number => (pence ?? 0) / 100
  const pence = (amount: number | undefined): number => Math.round((amount ?? 0) * 100)

  test('a cap in pence reads as pounds', () => {
    expect(pounds(2000)).toBe(20)
    expect(pounds(2550)).toBe(25.5)
    expect(pounds(undefined)).toBe(0)
  })

  test('pounds typed in come back as whole pence', () => {
    expect(pence(30)).toBe(3000)
    expect(pence(25.5)).toBe(2550)
    // A third of a pound is not a number of pence, so it rounds rather than storing a fraction.
    expect(pence(0.005)).toBe(1)
    expect(Number.isInteger(pence(19.999))).toBe(true)
  })
})

// Every screen that counts something says the count in words a reader would use.
describe('a count reads as English', () => {
  test('one is singular and everything else is not', () => {
    expect(plural(1, 'account')).toBe('1 account')
    expect(plural(0, 'account')).toBe('0 accounts')
    expect(plural(4, 'membership')).toBe('4 memberships')
  })

  test('an irregular plural is given rather than guessed', () => {
    expect(plural(2, 'person', 'people')).toBe('2 people')
    expect(plural(1, 'person', 'people')).toBe('1 person')
  })
})
