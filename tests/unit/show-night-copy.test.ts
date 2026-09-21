import { describe, expect, test } from 'bun:test'
import { CAMERA_FALLBACK_SAYS, doorVerdict, saysPassCoverage } from '#shared/utils/door'
import { nightHeaderLine } from '#shared/utils/night-hub'
import { saysChargeOnReader, saysChargeOnSumUp } from '#shared/utils/till'

// K-128 criterion 2 on the `tonight` shell (issue 1150 item 16). docs/copy-style.md §3 gives the
// register: two or three words per control, no machine vocabulary, no reasoning on screen.

const SHOW_NIGHT_GLOBS = [
  { cwd: 'app/pages/tonight', pattern: '**/*.vue', prefix: 'app/pages/tonight/' },
  { cwd: 'app/components/till', pattern: '**/*.vue', prefix: 'app/components/till/' },
]

const SHOW_NIGHT_FILES = [
  'app/components/BoardFeed.vue',
  'app/components/DoorPassMode.vue',
  'app/components/DoorVerdictCard.vue',
  'app/components/NightAction.vue',
  'app/components/NightBlock.vue',
  'app/components/NightKpi.vue',
  'app/components/NightPerformanceSwitcher.vue',
  'app/components/NightScreen.vue',
  'app/components/NightStale.vue',
  'app/components/NightTile.vue',
  'app/components/QrScanner.vue',
  'app/layouts/backstage.vue',
  'app/layouts/tonight.vue',
  'app/pages/board/index.vue',
  'shared/utils/age-checks.ts',
  'shared/utils/checklist.ts',
  'shared/utils/door.ts',
  'shared/utils/incidents.ts',
  'shared/utils/night-hub.ts',
  'shared/utils/sale.ts',
  'shared/utils/till.ts',
  'shared/utils/tonight.ts',
]

function showNightFiles(): string[] {
  const found = [...SHOW_NIGHT_FILES]
  for (const glob of SHOW_NIGHT_GLOBS) {
    const scanned = new Bun.Glob(glob.pattern).scanSync({ cwd: glob.cwd, onlyFiles: true })
    for (const path of scanned) found.push(`${glob.prefix}${path}`)
  }
  return found.sort()
}

function withoutComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .split('\n')
    .map(line => line.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n')
}

const TAILWIND_WORD = /^[a-z0-9@:[\]()/.,\-_%!&#]+$/
const NOT_READER = [
  /^[#/]/, // an import alias, a route or an asset path
  /^i-lucide/, //   an icon name
  /^\d+(\.\d+)?$/,
]

// A class list, a route and an expression are not copy. The rule is coarse on purpose: a string a
// reader sees has a space in it, a lower-case letter, and at least one word Tailwind would not use.
function readerString(value: string): boolean {
  const text = value.trim()
  if (!text.includes(' ') || !/[a-z]/.test(text)) return false
  if (NOT_READER.some(shape => shape.test(text))) return false
  return !text.split(/\s+/).every(word => TAILWIND_WORD.test(word))
}

function scriptStrings(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`/g)) {
    found.push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  return found
}

// Only a literal attribute is copy: `:description` and `@press` carry an expression, and `v-if`
// carries a condition.
function templateStrings(source: string): string[] {
  const start = source.search(/^<template>$/m)
  if (start === -1) return scriptStrings(source)
  const template = source.slice(start)
  const found: string[] = []
  for (const match of template.matchAll(/(^|\s)([a-zA-Z][a-zA-Z0-9-]*)="([^"]*)"/g)) {
    found.push(match[3] ?? '')
  }
  for (const text of template.matchAll(/>([^<>{}]+)</g)) found.push(text[1] ?? '')
  return [...found, ...scriptStrings(source.slice(0, start))]
}

async function copyIn(file: string): Promise<string[]> {
  const source = withoutComments(await Bun.file(file).text())
  const strings = file.endsWith('.vue') ? templateStrings(source) : scriptStrings(source)
  return strings.filter(readerString)
}

// docs/copy-style.md: the estate's own vocabulary, which is never the reader's.
const MACHINE_WORDS = [
  'ledger', 'append-only', 'supersede', 'supersedes', 'superseded', 'superseding', 'transaction',
  'transactions', 'stamp', 'stamped', 'tombstone', 'snapshot', 'sweep', 'cache', 'cached',
  'configured', 'schema', 'the system', 'the server', 'the database',
]

// Copy-style §2: the instruction goes on screen, the reasoning stays in the decision record.
const SELF_JUSTIFYING = ['because', 'so that', 'which is why', 'rather than', 'on purpose']

describe('the show-night screens never narrate the machine (K-128, issue 1150 item 16)', () => {
  test('no reader-facing string uses the estate\'s own vocabulary', async () => {
    const offenders: string[] = []
    for (const file of showNightFiles()) {
      for (const said of await copyIn(file)) {
        for (const word of MACHINE_WORDS) {
          if (new RegExp(`(^|[^a-z-])${word}([^a-z-]|$)`, 'i').test(said)) {
            offenders.push(`${file}  ${word}: ${said}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  test('no reader-facing string explains itself', async () => {
    const offenders: string[] = []
    for (const file of showNightFiles()) {
      for (const said of await copyIn(file)) {
        for (const phrase of SELF_JUSTIFYING) {
          if (new RegExp(`(^|[^a-z])${phrase}([^a-z]|$)`, 'i').test(said)) {
            offenders.push(`${file}  ${phrase}: ${said}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

// Copy-style §3: two or three words per control on `tonight`, and §8: never a pronoun.
const CONTROL_WORD_LIMIT = 4
const PRONOUN_LABEL = /\b(it|them|this|that)\b\s*$/i

function controlLabels(source: string): string[] {
  const found: string[] = []
  const tag = /<(UButton|NightAction|NightTile)\b((?:"[^"]*"|'[^']*'|[^>"'])*)(\/>|>([\s\S]*?)<\/\1>)/g
  for (const button of source.matchAll(tag)) {
    const attributes = button[2] ?? ''
    const inner = (button[4] ?? '').trim()
    const labelled = /(^|\s)label="([^"]*)"/.exec(attributes)?.[2]
    if (labelled) found.push(labelled)
    if (inner && !inner.includes('<') && !inner.includes('{{')) found.push(inner)
  }
  return found
}

describe('a show-night control is two or three words (K-128, issue 1150 item 16)', () => {
  test('no button label runs past four words', async () => {
    const offenders: string[] = []
    for (const file of showNightFiles().filter(path => path.endsWith('.vue'))) {
      const source = withoutComments(await Bun.file(file).text())
      for (const label of controlLabels(source)) {
        const words = label.split(/\s+/).filter(Boolean)
        if (words.length > CONTROL_WORD_LIMIT) offenders.push(`${file}  ${words.length} words: ${label}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('no button label ends in a pronoun', async () => {
    const offenders: string[] = []
    for (const file of showNightFiles().filter(path => path.endsWith('.vue'))) {
      const source = withoutComments(await Bun.file(file).text())
      for (const label of controlLabels(source)) {
        if (PRONOUN_LABEL.test(label)) offenders.push(`${file}  ${label}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('the till\'s charge labels stay inside the limit at every total', () => {
    const labels = [
      saysChargeOnReader(null, false),
      saysChargeOnReader(1250, false),
      saysChargeOnReader(null, true),
      saysChargeOnReader(1250, true),
      saysChargeOnSumUp(null),
      saysChargeOnSumUp(1250),
    ]
    expect(labels.filter(label => label.split(/\s+/).length > CONTROL_WORD_LIMIT)).toEqual([])
    expect(saysChargeOnReader(1250, false)).toBe('Charge £12.50')
    expect(saysChargeOnReader(1250, true)).toBe('Charge the tab')
    expect(saysChargeOnSumUp(1250)).toBe('Charge £12.50 on SumUp')
    expect(saysChargeOnSumUp(null)).toBe('Charge on SumUp')
  })
})

describe('a count on a show-night screen comes from plural() (K-128, copy-style §9)', () => {
  test('nothing hand-rolls a plural', async () => {
    const offenders: string[] = []
    for (const file of showNightFiles()) {
      const source = withoutComments(await Bun.file(file).text())
      source.split('\n').forEach((line, index) => {
        if (/[?]\s*'s?'\s*:\s*'s?'/.test(line) || /===\s*1\s*\?/.test(line) || /!==\s*1\s*\?/.test(line)) {
          offenders.push(`${file}:${index + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  test('a pass covering one show says so through plural()', () => {
    expect(saysPassCoverage('season', 1)).toBe('1 show')
    expect(saysPassCoverage('season', 3)).toBe('3 shows')
    expect(saysPassCoverage('season', 0)).toBe('No shows yet')
    expect(saysPassCoverage('fellowship', 0)).toBe('All in-house shows')
  })
})

// PR 1157 settled these three sentences in shared/utils/door.ts; a screen that spells its own is
// how the door and the till drifted apart in the first place.
describe('one set of camera-failure words (K-128, issue 1150 item 16)', () => {
  test('nothing outside door.ts writes the fallback sentence', async () => {
    const offenders: string[] = []
    for (const file of showNightFiles().filter(path => path !== 'shared/utils/door.ts')) {
      const source = await Bun.file(file).text()
      for (const said of Object.values(CAMERA_FALLBACK_SAYS)) {
        if (source.includes(said)) offenders.push(`${file}  ${said}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('every camera screen reads them from door.ts', async () => {
    for (const file of ['app/components/QrScanner.vue', 'app/pages/tonight/door/index.vue', 'app/composables/useTillTickets.ts']) {
      expect(`${file}: ${(await Bun.file(file).text()).includes('CAMERA_FALLBACK_SAYS')}`).toBe(`${file}: true`)
    }
  })
})

// Issue 1150 item 16: PR 1165 settled sold, in and seats left; paid is what a booking that has
// paid reads, and in is what an admitted one reads. Collected was the third word for the same two.
describe('the house vocabulary is one set of words (K-128, issue 1150 item 16)', () => {
  test('the door admits a paid booking in the house\'s own word', () => {
    expect(doorVerdict({ headline: 'Admit', detail: null, admit: true }, false).line).toBe('Paid, admit')
  })

  test('no show-night screen says collected', async () => {
    const offenders: string[] = []
    for (const file of showNightFiles()) {
      for (const said of await copyIn(file)) {
        if (/collected/i.test(said)) offenders.push(`${file}  ${said}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('the backstage code has one name', async () => {
    const offenders: string[] = []
    for (const file of showNightFiles()) {
      const source = withoutComments(await Bun.file(file).text())
      if (/tonight's code/i.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
    for (const file of ['app/pages/tonight/board.vue', 'app/pages/tonight/glance.vue']) {
      expect(`${file}: ${(await Bun.file(file).text()).includes('Backstage code')}`).toBe(`${file}: true`)
    }
  })
})

// Copy-style §9: a screen asks for a shape, it never builds one. The show-night screens were the
// last block on design-language.test.ts's allow-list.
describe('a show-night date comes from when.ts (K-128, copy-style §9)', () => {
  test('nothing formats its own clock', async () => {
    const offenders: string[] = []
    for (const file of showNightFiles()) {
      const source = withoutComments(await Bun.file(file).text())
      if (/\bformatLondon\(/.test(source) || /\blondonClock\(/.test(source)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  test('the header line is the short day, the clock and the venue', () => {
    // 19:30 on Thursday 5 November 2026, in London.
    expect(nightHeaderLine(1793907000, 'Main Hall')).toBe('Thu 5 Nov · 19:30 · Main Hall')
  })
})
