import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { CONFIRM_BACK_LABEL } from '#shared/utils/admin-conventions'
import { penceFromPounds } from '#shared/utils/admin-forms'
import { saysMoney } from '#shared/utils/bar'
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
    // One spelling whatever the platform separates directories with, so an allow-list matches.
    const path = join(PAGES, entry).replaceAll('\\', '/')
    const source = await Bun.file(path).text()
    if (CONSOLE_LAYOUT.test(source)) found.push({ path, source })
  }
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

const offenders = async (test: (source: string) => boolean): Promise<string[]> =>
  (await screens()).filter(screen => test(screen.source)).map(screen => screen.path)

// A section of a console screen is a component, so the table rules follow the table out of the
// page and into wherever it lives now (D-132 criterion 1).
const COMPONENTS = 'app/components'

async function tables(): Promise<{ path: string, source: string }[]> {
  const found = (await screens()).filter(screen => screen.source.includes('<UTable'))
  for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: COMPONENTS, onlyFiles: true })) {
    const path = join(COMPONENTS, entry)
    const source = await Bun.file(path).text()
    // One spelling whatever the platform separates directories with, so an allow-list matches.
    if (source.includes('<UTable')) found.push({ path: path.replaceAll('\\', '/'), source })
  }
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

// A fixed report of one thing's own rows, with nothing to search or filter: the toolbar would be
// an empty row of controls. Everything else answers to the rule.
const REPORTS_WITHOUT_A_TOOLBAR = [
  'app/components/box-office/show/Sales.vue',
  // A fixed report of one order's own rows, and one stocktake's own lines: nothing to search or
  // filter by name across other rows, so the shared toolbar would sit empty (0032).
  'app/pages/bar/stock/order-list.vue',
  'app/pages/bar/stock/stocktakes/[id].vue',
  // The desk searches by reference and scans a code: its results are what one lookup returned,
  // and the status pills beside the search are the only narrowing there is (D-114).
  'app/pages/box-office/desk.vue',
]

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
    const lists = (await tables()).filter(screen => !REPORTS_WITHOUT_A_TOOLBAR.includes(screen.path))
    expect(lists.length).toBeGreaterThan(0)
    expect(lists.filter(screen => !screen.source.includes('<AdminToolbar')).map(screen => screen.path)).toEqual([])
  })
})

// Every console list declares its filters once and reads them through useListQuery (K-129
// criterion 6). Flipped on by the last module's migration; until then only the migrated hold.
const FILTERS_DECLARED_EVERYWHERE = false

describe('a console list filters by its declaration (K-129)', () => {
  const lists = tables

  test('a list that has migrated does not also hand-write its chips or its filter refs', async () => {
    const migrated = (await lists()).filter(screen => screen.source.includes('<ConsoleFilters'))
    expect(migrated.length).toBeGreaterThan(0)
    expect(migrated.filter(screen => !screen.source.includes('useListQuery(')).map(screen => screen.path)).toEqual([])
    expect(migrated.filter(screen => /ActiveFilter\[\]/.test(screen.source)).map(screen => screen.path)).toEqual([])
  })

  test.skipIf(!FILTERS_DECLARED_EVERYWHERE)('every list has a declaration and no hand-written chip list', async () => {
    const undeclared = (await lists()).filter(screen => !screen.source.includes('useListQuery('))
    expect(undeclared.map(screen => screen.path)).toEqual([])
    const handWritten = (await lists()).filter(screen => /ActiveFilter\[\]/.test(screen.source))
    expect(handWritten.map(screen => screen.path)).toEqual([])
  })
})

// What a destructive route looks like from the page: a DELETE, or a POST to a path whose last
// segment names what it undoes. A status flip is both directions; only the off one confirms.
const DESTRUCTIVE_ROUTE = /method:\s*'DELETE'|\/(?:cancel|revoke|void|decline|retire|unconfirm|stand-down|status|security)['`]/

// A destructive action that already confirms in a dialogue of its own, with a verb naming what it
// destroys. Moving each onto ConfirmModal is mechanical; the list may shrink and may not grow.
const CONFIRMS_IN_ITS_OWN_DIALOGUE = [
  'app/pages/bar/categories.vue',
  'app/pages/bar/tabs.vue',
  'app/pages/box-office/content-warnings.vue',
  'app/pages/box-office/pass-types.vue',
  'app/pages/box-office/seasons.vue',
  'app/pages/box-office/show-categories.vue',
  'app/pages/box-office/ticket-types.vue',
  'app/pages/box-office/venues.vue',
  'app/pages/people/fellows.vue',
  'app/pages/people/members.vue',
  'app/pages/rooms/manage/closures.vue',
  'app/pages/rota/manage/approvals.vue',
  'app/pages/training/manage/records.vue',
  'app/pages/training/manage/requests.vue',
  'app/pages/training/manage/sessions/[id].vue',
]

describe('a destructive action confirms before it happens (K-123, 0032)', () => {
  test('every console page that destroys something confirms first', async () => {
    const destructive = (await screens()).filter(screen => DESTRUCTIVE_ROUTE.test(screen.source))
    expect(destructive.length).toBeGreaterThan(0)
    const unconfirmed = destructive
      .filter(screen => !screen.source.includes('<ConfirmModal') && !CONFIRMS_IN_ITS_OWN_DIALOGUE.includes(screen.path))
      .map(screen => screen.path)
    expect(unconfirmed).toEqual([])
  })

  // The cancel word is read from one place, so the modal-conventions job changes one string.
  test('the shared component reads its cancel label rather than spelling it', async () => {
    const component = await Bun.file('app/components/ConfirmModal.vue').text()
    expect(component).toContain('CONFIRM_BACK_LABEL')
    expect(CONFIRM_BACK_LABEL.trim()).toBe(CONFIRM_BACK_LABEL)
    expect(CONFIRM_BACK_LABEL.endsWith('.')).toBe(false)
  })

  // A refusal belongs inside the modal it concerns, never in a page alert behind the overlay
  // (0032). The component takes it as a prop, so no caller has to remember.
  test('the shared component renders a refusal of its own', async () => {
    const component = await Bun.file('app/components/ConfirmModal.vue').text()
    expect(component).toContain('failure')
    expect(component).toContain('<UAlert')
  })
})

describe('feedback goes where it belongs (0032)', () => {
  // A confirmation the reader does not have to act on is a toast, not something that sits on the
  // page until it is dismissed.
  test('every table says what would be there when it is empty', async () => {
    const all = await tables()
    expect(all.length).toBeGreaterThan(0)
    expect(all.filter(screen => !screen.source.includes('#empty')).map(screen => screen.path)).toEqual([])
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

// The reader is read in pounds and pence off the SumUp reader, and the route still takes pence
// (K-123 criterion 2, 0004). The parser is the one place the two meet.
describe('a figure read off the card reader is typed as pounds and pence', () => {
  test('pounds and pence come back as whole pence', () => {
    expect(penceFromPounds('123.45')).toBe(12345)
    expect(penceFromPounds('0.05')).toBe(5)
  })

  test('a bare number of pounds is pounds, not pence', () => {
    expect(penceFromPounds('123')).toBe(12300)
  })

  test('a thousands comma and a pound sign are read through', () => {
    expect(penceFromPounds('1,234.50')).toBe(123450)
    expect(penceFromPounds('\u00a3123.45')).toBe(12345)
    expect(penceFromPounds(' \u00a31,234.50 ')).toBe(123450)
  })

  test('anything else is refused rather than guessed', () => {
    for (const raw of ['', '  ', 'abc', '12.345', '1.2.3', '-5', '12p', '\u00a3']) {
      expect(penceFromPounds(raw)).toBeNull()
    }
  })

  test('what is typed round-trips to what the screen shows beside it', () => {
    expect(saysMoney(penceFromPounds('123.45')!)).toBe('\u00a3123.45')
    expect(saysMoney(penceFromPounds('1,234.50')!)).toBe('\u00a31234.50')
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

// A picker reads the whole catalogue or it silently hides part of it: the modules list pages at
// 25, and a chip wall built from one page cannot offer the twenty-sixth (issue 1146).
describe('a screen that offers the module catalogue to choose from reads all of it', () => {
  test('every whole-catalogue read of the admin modules list names MAX_PAGE_SIZE', async () => {
    const readers = (await screens()).filter(screen => /request<[^>]*>\('\/api\/admin\/training\/modules'/.test(screen.source))
    expect(readers.length).toBeGreaterThan(0)
    const partial = readers
      .filter(screen => !/'\/api\/admin\/training\/modules',\s*\{\s*query:\s*\{\s*pageSize:\s*MAX_PAGE_SIZE/.test(screen.source))
      .map(screen => screen.path)
    expect(partial).toEqual([])
  })
})

// The show-night kit keeps its own register (design language rule 3), so the till's modals are
// not console chrome and the modal frame does not reach them.
const SHOW_NIGHT_COMPONENTS = 'app/components/till/'

// Each modal on its own, so a rule about one does not read its neighbour's markup.
function modalsIn(source: string): string[] {
  const blocks: string[] = []
  const tag = /<UModal\b|<\/UModal>/g
  let depth = 0
  let start = 0
  let match: RegExpExecArray | null
  while ((match = tag.exec(source)) !== null) {
    if (match[0] === '</UModal>') {
      depth--
      if (depth === 0) blocks.push(source.slice(start, match.index))
    }
    else {
      if (depth === 0) start = match.index
      depth++
    }
  }
  return blocks
}

async function modals(): Promise<{ path: string, modals: string[] }[]> {
  const files = [...await screens()]
  for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: COMPONENTS, onlyFiles: true })) {
    // One spelling whatever the platform separates directories with, so an allow-list matches.
    const path = join(COMPONENTS, entry).replaceAll('\\', '/')
    if (!path.startsWith(SHOW_NIGHT_COMPONENTS)) files.push({ path, source: await Bun.file(path).text() })
  }
  return files
    .map(file => ({ path: file.path, modals: modalsIn(file.source) }))
    .filter(file => file.modals.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path))
}

const hasModal = async (test: (modal: string) => boolean): Promise<string[]> =>
  (await modals()).filter(file => file.modals.some(test)).map(file => file.path)

// The words the console spelled its way out with, so a sixth is caught as well as a relapse.
const SPELLED_CANCEL = /<UButton\b[^>]*>\s*(?:Cancel|Back|Keep it|Close|OK|Never mind)\s*<\/UButton>/

// A form modal whose Save still sits in the body. Moving each into the footer is mechanical and
// changes no flow; the list may shrink and may not grow.
const FORM_MODAL_ACTIONS_IN_THE_BODY = [
  'app/components/box-office/show/Performances.vue',
  'app/components/training/ModuleEditor.vue',
  'app/pages/admin/audit.vue',
  'app/pages/admin/backups.vue',
  'app/pages/bar/categories.vue',
  'app/pages/bar/discounts.vue',
  'app/pages/bar/products/[id].vue',
  'app/pages/bar/products/index.vue',
  'app/pages/bar/stock/index.vue',
  'app/pages/box-office/access-profiles.vue',
  'app/pages/box-office/content-warnings.vue',
  'app/pages/box-office/pass-types.vue',
  'app/pages/box-office/seasons.vue',
  'app/pages/box-office/show-categories.vue',
  'app/pages/box-office/shows/index.vue',
  'app/pages/box-office/ticket-types.vue',
  'app/pages/box-office/venues.vue',
  'app/pages/people/fellows.vue',
  'app/pages/people/members.vue',
  'app/pages/rooms/manage/other.vue',
  'app/pages/rota/manage/approvals.vue',
  'app/pages/training/manage/departments.vue',
  'app/pages/training/manage/sessions/index.vue',
]

describe('every console modal wears one frame (K-123 criterion 8, 0032)', () => {
  test('no modal spells its own way out', async () => {
    expect((await modals()).length).toBeGreaterThan(0)
    expect(await hasModal(modal => SPELLED_CANCEL.test(modal))).toEqual([])
  })

  test('a title states what the modal does rather than asking', async () => {
    expect(await hasModal(modal => /\stitle="[^"]*\?"/.test(modal))).toEqual([])
  })

  test('a form modal keeps its actions in the footer', async () => {
    const inTheBody = (await hasModal(modal => /<UForm\b/.test(modal) && !modal.includes('#footer')))
      .filter(path => !FORM_MODAL_ACTIONS_IN_THE_BODY.includes(path))
    expect(inTheBody).toEqual([])
  })
})

// A date a person reads comes from the shared shapes in shared/utils/when.ts (K-128, 0014).
// A locale format takes the runtime's zone, which is UTC, so it is wrong for half the year.
const LOCALE_FORMAT = /\.toLocale(?:Date|Time)?String\(/

// Machine values a reader never sees: an input's value, a query string. The list may shrink
// and may not grow.
const CONSOLE_RAW_DATES: string[] = []

const templateOf = (source: string): string => {
  const start = source.search(/^<template>$/m)
  return start === -1 ? '' : source.slice(start)
}

describe('a console date is read in London (K-128, issue 1151 item 8)', () => {
  test('no console screen formats a date by locale', async () => {
    expect((await offenders(source => LOCALE_FORMAT.test(source)))
      .filter(path => !CONSOLE_RAW_DATES.includes(path))).toEqual([])
  })

  test('no console screen puts an ISO instant on the page', async () => {
    expect(await offenders(source => templateOf(source).includes('toISOString('))).toEqual([])
  })
})

// A machine word a reader can see: an enum value, a permission or audit code, a table name, a
// configuration key. The console says what the value means (K-128 criterion 1, copy-style §3).
const CODE_FIELDS = 'status|kind|role|action|outcome|refTable|scope'
const BARE_IN_TEMPLATE = new RegExp(String.raw`\{\{\s*[A-Za-z_$][\w.?]*\.(?:${CODE_FIELDS})\s*\}\}`)
// The whole cell, so a code compared against rather than rendered is not mistaken for one shown.
const BARE_IN_A_CELL = new RegExp(String.raw`=>\s*row\.original\.(?:${CODE_FIELDS})(?!\s*[\w=!.?[(])`)
// Spacing a code out is not wording it: "stocktake lines" is still the table's name.
const CODE_DRESSED_UP = /\.replaceAll\('_', ' '\)/
// A select whose options are the values themselves, spread or spelled.
const CODES_AS_OPTIONS = /:items="\[(?:\.\.\.[A-Z][A-Z_]+|\s*'[A-Z][A-Z_]*'|\s*"[A-Z][A-Z_]*")/
// A refusal that opens with the key it concerns rather than with what happened.
const KEY_BEFORE_THE_REFUSAL = /\$\{[\w.]+\.key\}:/

// The developer tools never ship (K-124) and their reader wants the value the estate stores.
const READS_THE_MACHINE = ['app/pages/dev.vue']

describe('no code reaches a reader on the console (K-128, issue 1151 item 8)', () => {
  test('no screen shows an enum value as it is stored', async () => {
    expect((await offenders(source =>
      BARE_IN_TEMPLATE.test(templateOf(source)) || BARE_IN_A_CELL.test(source) || CODE_DRESSED_UP.test(source),
    )).filter(path => !READS_THE_MACHINE.includes(path))).toEqual([])
  })

  test('no screen offers codes as the options of a select', async () => {
    expect((await offenders(source => CODES_AS_OPTIONS.test(source)))
      .filter(path => !READS_THE_MACHINE.includes(path))).toEqual([])
  })

  test('no refusal opens with a configuration key', async () => {
    expect(await offenders(source => KEY_BEFORE_THE_REFUSAL.test(source))).toEqual([])
  })

  test('the shared desk wording never lowercases a status into place', async () => {
    const wording = await Bun.file('shared/utils/desk.ts').text()
    expect(wording.includes('status.toLowerCase()')).toBe(false)
  })

  test('no console screen carries an en dash', async () => {
    expect(await offenders(source => source.includes('–'))).toEqual([])
  })
})

// A console component tree: a screen's table that moved out of its page keeps the table rules
// with it. The show-night kit keeps its own register (design language rule 3).
const CONSOLE_COMPONENTS = ['app/components/box-office/', 'app/components/training/']

async function consoleFiles(): Promise<{ path: string, source: string }[]> {
  const files = [...await screens()]
  for (const entry of new Bun.Glob('**/*.vue').scanSync({ cwd: COMPONENTS, onlyFiles: true })) {
    // One spelling whatever the platform separates directories with, so an allow-list matches.
    const path = join(COMPONENTS, entry).replaceAll('\\', '/')
    if (CONSOLE_COMPONENTS.some(tree => path.startsWith(tree))) files.push({ path, source: await Bun.file(path).text() })
  }
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

// The column definitions of one file, each column on its own, so a rule about one column does not
// read its neighbour's buttons.
function columnEntries(source: string): string[][] {
  const blocks: string[][] = []
  const opening = /columns[^=\n]*=\s*\[/g
  let match: RegExpExecArray | null
  while ((match = opening.exec(source)) !== null) {
    const entries: string[] = []
    let depth = 1
    let start = match.index + match[0].length
    for (let index = start; index < source.length && depth > 0; index++) {
      const character = source[index]
      if (character === '[' || character === '{') depth++
      else if (character === ']' || character === '}') {
        depth--
        if (depth === 1) {
          entries.push(source.slice(start, index + 1))
          start = index + 1
        }
      }
    }
    if (entries.length > 0) blocks.push(entries)
  }
  return blocks
}

// A table whose narrow view has not been swept (issue 1151 item 6). Each takes HIDE_BELOW_SM on
// the columns a phone cannot hold; the list may shrink and may not grow.
const TABLES_AWAITING_A_NARROW_VIEW: string[] = []

// A row of actions not yet swept. Each keeps its primary action in line and puts the rest in a
// UDropdownMenu; the list may shrink and may not grow.
const ROWS_AWAITING_AN_OVERFLOW: string[] = []

// The screens that listed their records as divs (issue 1151 item 6). A list of records is a table
// wherever it sits, and markup that only looks like one carries none of the rules.
const LISTS_THAT_WERE_DIVS = [
  'app/pages/rota/manage/backstage.vue',
  'app/pages/rota/manage/safety.vue',
  'app/pages/training/manage/requests.vue',
]

describe('every console list is a UTable the shell knows about (K-123 criteria 9 and 10)', () => {
  test('no console screen or console component writes table markup by hand', async () => {
    const all = await consoleFiles()
    expect(all.length).toBeGreaterThan(0)
    expect(all.filter(file => file.source.includes('<table')).map(file => file.path)).toEqual([])
  })

  test('no action column leaves its header empty', async () => {
    const all = await consoleFiles()
    expect(all.filter(file => /header:\s*''/.test(file.source)).map(file => file.path)).toEqual([])
  })

  test('a screen that lists records lists them in a table', async () => {
    const sources = new Map((await screens()).map(screen => [screen.path, screen.source]))
    expect(LISTS_THAT_WERE_DIVS.filter(path => !(sources.get(path) ?? '').includes('<UTable'))).toEqual([])
  })

  test('a table of more than three columns says which of them a phone drops', async () => {
    const wide = (await tables()).filter(file => columnEntries(file.source)
      .some(entries => entries.length > 3 && !entries.some(entry => entry.includes('HIDE_BELOW_SM'))))
    expect(wide.map(file => file.path).filter(path => !TABLES_AWAITING_A_NARROW_VIEW.includes(path))).toEqual([])
  })

  test('a row of more than three actions puts the rest behind an overflow', async () => {
    const walls = (await tables()).filter(file => columnEntries(file.source)
      .some(entries => entries.some(entry => (entry.match(/h\(UButton/g) ?? []).length > 3 && !entry.includes('UDropdownMenu'))))
    expect(walls.map(file => file.path).filter(path => !ROWS_AWAITING_AN_OVERFLOW.includes(path))).toEqual([])
  })
})
