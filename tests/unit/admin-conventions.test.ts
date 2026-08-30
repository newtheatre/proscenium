import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

// The admin conventions are a test rather than a review habit (0032), the same way the design
// language is (0021). What review still judges is whether a screen says the right thing.

const ADMIN = 'app/pages/admin'

async function screens(): Promise<{ path: string, source: string }[]> {
  const found: { path: string, source: string }[] = []
  for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: ADMIN, onlyFiles: true })) {
    const path = join(ADMIN, entry)
    found.push({ path, source: await Bun.file(path).text() })
  }
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

const offenders = async (test: (source: string) => boolean): Promise<string[]> =>
  (await screens()).filter(screen => test(screen.source)).map(screen => screen.path)

describe('an input is the component for its value (0032)', () => {
  test('a date is UInputDate, never a native date input', async () => {
    expect(await offenders(source => /type="date"/.test(source))).toEqual([])
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

  test('a screen that confirms an action uses a toast', async () => {
    const confirming = (await screens()).filter(screen =>
      /Recorded|Revoked\.|is on the (roll|trail)/.test(screen.source))
    expect(confirming.length).toBeGreaterThan(0)
    expect(confirming.filter(screen => !screen.source.includes('useToast')).map(screen => screen.path)).toEqual([])
  })
})
