import { describe, expect, test } from 'bun:test'
import { saysStanding } from '#shared/utils/no-shows'
import { saysRequestStatus } from '#shared/utils/training'

// K-128 criterion 2, issue 1153 item 8: the member shell's words, swept once and held here. The
// public shell's words are swept and held beside it, in tests/unit/public-copy.test.ts.

// The member's own screens. Everything under a manage/ path is the console's, and is swept there.
const MEMBER_DIRECTORIES = [
  'app/pages/account',
  'app/pages/my',
  'app/pages/passes',
  'app/pages/rooms',
  'app/pages/rota',
  'app/pages/training',
  'app/components/my',
]

const MEMBER_FILES = ['app/components/AccountSettings.vue', 'app/components/RoomGrid.vue', 'app/components/ReadFailure.vue']

// The shared helpers the member screens read their sentences out of. site-nav.ts is not among
// them: it holds the console's labels too, and those are the console's own register.
const SHARED_MEMBER = [
  'shared/utils/membership.ts',
  'shared/utils/my-summary.ts',
  'shared/utils/no-shows.ts',
  'shared/utils/notifications.ts',
  'shared/utils/training.ts',
]

function memberFiles(): string[] {
  const found = [...MEMBER_FILES]
  for (const directory of MEMBER_DIRECTORIES) {
    const glob = new Bun.Glob('**/*.vue')
    for (const path of glob.scanSync({ cwd: directory, onlyFiles: true })) {
      if (!path.includes('manage/')) found.push(`${directory}/${path}`)
    }
  }
  return [...found, ...SHARED_MEMBER].sort()
}

// A comment carries a constraint for the next developer, not copy for a reader, so the sweep
// reads past it. The same goes for an import path and a data-test hook.
function withoutComments(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/^\s*import[\s\S]*?from\s+'[^']*'$/gm, ' ')
    .replace(/:?data-test="[^"]*"/g, ' ')
}

// A string a person reads starts with a capital and runs to more than one word. A class list, an
// icon name, an enum value and a route all fail one of those, which is what keeps them out.
const READS_AS_COPY = /^[A-Z£][^\n]*\s\S/

function readerStrings(file: string, source: string): string[] {
  const clean = withoutComments(source)
  const strings: string[] = []

  if (file.endsWith('.vue')) {
    const start = clean.search(/^<template>$/m)
    const template = start === -1 ? '' : clean.slice(start)
    for (const [, text] of template.matchAll(/>([^<>]+)</g)) {
      const words = (text ?? '').replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/\s+/g, ' ').trim()
      if (words && READS_AS_COPY.test(words)) strings.push(words)
    }
  }

  for (const [, quoted] of clean.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
    if (quoted && READS_AS_COPY.test(quoted)) strings.push(quoted)
  }
  for (const [, quoted] of clean.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
    if (quoted && READS_AS_COPY.test(quoted)) strings.push(quoted)
  }
  for (const [, quoted] of clean.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    const words = (quoted ?? '').replace(/\$\{[\s\S]*?\}/g, ' ').replace(/\s+/g, ' ').trim()
    if (words && READS_AS_COPY.test(words)) strings.push(words)
  }

  return strings
}

async function memberCopy(): Promise<{ file: string, says: string }[]> {
  const copy: { file: string, says: string }[] = []
  for (const file of memberFiles()) {
    for (const says of readerStrings(file, await Bun.file(file).text())) copy.push({ file, says })
  }
  return copy
}

function offending(copy: { file: string, says: string }[], pattern: RegExp): string[] {
  return copy.filter(one => pattern.test(one.says)).map(one => `${one.file}  ${one.says}`)
}

describe('the member never reads the estate\'s own words (issue 1153 item 8)', () => {
  test('nothing on a member screen promises something later', async () => {
    const LATER = /\b(not yet|not enforced yet|coming soon|arrives with|for now)\b/i
    expect(offending(await memberCopy(), LATER)).toEqual([])
  })

  test('no member screen names a story or a decision record', async () => {
    expect(offending(await memberCopy(), /\b[A-Z]-\d{3}\b/)).toEqual([])
  })

  test('no member string narrates the machine', async () => {
    // A row, a factor and a credit line are the estate's own vocabulary, not the reader's.
    const NARRATION = /\b(anonymous rows|a second factor|credit extended|ledger|append-only|supersedes?|the system|the server|the database|schema)\b/i
    expect(offending(await memberCopy(), NARRATION)).toEqual([])
  })

  test('no member string explains itself', async () => {
    const WHY = /\b(because|so that|which is why|on purpose)\b/i
    expect(offending(await memberCopy(), WHY)).toEqual([])
  })

  test('the officer who decides is named, never left as somebody', async () => {
    // "Somebody else" for another member is fine; "somebody" standing in for the person with the
    // authority to decide is what this bans.
    const VAGUE = /\bsomebody (decides|will decide|to agree|already has it|deciding)\b/i
    expect(offending(await memberCopy(), VAGUE)).toEqual([])
  })

  test('the door is not a shorthand for the people working it', async () => {
    expect(offending(await memberCopy(), /\bthe door (sees|sees anything|see)\b/i)).toEqual([])
  })
})

describe('one word for one thing on the member shell (K-128 criterion 2)', () => {
  test('the membership state is worded in one place', async () => {
    const membership = await Bun.file('shared/utils/membership.ts').text()
    expect(membership).toContain('MEMBERSHIP_WORDING')
    expect(membership).toContain('saysMembershipState')
    // Every state word, and every sentence about it, comes from the shared helpers.
    const page = await Bun.file('app/pages/account/membership.vue').text()
    for (const spelled of ['>\n              Current\n', '>\n              In grace\n', '>\n              Lapsed\n', '>\n              None\n']) {
      expect(`spelled: ${page.includes(spelled)}`).toBe('spelled: false')
    }
    expect(page).toContain('saysMembershipState')
    expect(page).toContain('saysMembershipSentence')
  })

  test('a membership a member must sort out says what to do instead', async () => {
    expect(offending(await memberCopy(), /Sort out your membership/)).toEqual([])
  })

  test('the nav says room bookings where it means rooms', async () => {
    const nav = await Bun.file('shared/utils/site-nav.ts').text()
    expect(nav).not.toContain('label: \'My bookings\'')
    expect(nav).toContain('My room bookings')
  })

  test('a notification is a notification, never a message', async () => {
    expect(offending(await memberCopy(), /\bmessages?\b/i)).toEqual([])
  })

  test('a declined training request does not read as answered', async () => {
    expect(saysRequestStatus('DECLINED')).toBe('Declined')
  })

  test('a no-show sentence is in the reader\'s own voice', async () => {
    const ladder = { recordAt: 2, preApprovalAt: 3 }
    for (const standing of ['PRE_APPROVAL', 'RECORDED'] as const) {
      const said = saysStanding(standing, 3, ladder)
      expect(`${standing}: ${said.includes('were not turned up to')}`).toBe(`${standing}: false`)
      expect(`${standing}: ${said.includes('because')}`).toBe(`${standing}: false`)
    }
    expect(saysStanding('CLEAR', 1, ladder)).not.toContain('was not turned up to')
  })
})

describe('a member button is a verb and an object (copy-style section 8)', () => {
  test('nothing offers a bare verb', async () => {
    const BARE = /^(Withdraw|Withdraw it|Release|Submit|Save|Delete|Remove)$/
    const offenders = (await memberCopy()).filter(one => BARE.test(one.says)).map(one => `${one.file}  ${one.says}`)
    expect(offenders).toEqual([])
  })
})

// Each of these six said what was not there and stopped, naming nothing the reader could do
// about it. The exact wording that stopped short is what this holds out.
const STOPPED_SHORT: Record<string, string[]> = {
  'app/pages/account/notifications.vue': ['Nothing yet.'],
  'app/pages/account/passes.vue': ['You hold no passes yet.'],
  'app/pages/rota/index.vue': ['Nothing open right now.'],
  'app/pages/training/index.vue': ['Nothing yet.'],
  'app/pages/rooms/mine.vue': ['Nothing in the past yet.'],
  'app/pages/training/modules/index.vue': ['Nothing matches that.'],
}

describe('a member empty state names the one action that fills it (copy-style section 7)', () => {
  test('no member empty state stops at what is not there', async () => {
    const offenders: string[] = []
    for (const [file, saids] of Object.entries(STOPPED_SHORT)) {
      const source = await Bun.file(file).text()
      for (const said of saids) if (source.includes(said)) offenders.push(`${file}  ${said}`)
    }
    expect(offenders).toEqual([])
  })
})
