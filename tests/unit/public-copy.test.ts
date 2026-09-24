import { describe, expect, test } from 'bun:test'
import { HELP_ROOT } from '#shared/utils/docs-paths'

// K-128 criterion 2, issue 1152 item 8: the public shell's words, swept once and held here. The
// member shell's words are swept and held beside it, in tests/unit/member-copy.test.ts.

// What a visitor actually reads. Everything under app/pages/pay belongs to the show-night shell
// and is swept with it.
const PUBLIC_GLOBS = [
  'app/error.vue',
  'app/pages/[...slug].vue',
  'app/pages/get-involved.vue',
  'app/pages/help/[...slug].vue',
  'app/pages/index.vue',
  'app/pages/magic.vue',
  'app/pages/register.vue',
  'app/pages/reset.vue',
  'app/pages/sign-in.vue',
  'app/pages/verify.vue',
  'app/pages/whats-on.vue',
  'app/components/AuthStatus.vue',
  'app/components/MfaChallenge.vue',
  'app/components/PhotoHero.vue',
  'app/components/PosterFrame.vue',
  'app/components/ReauthenticateModal.vue',
  'app/components/ShowPosterCard.vue',
  'app/components/SignInMethods.vue',
  'app/components/SiteFooter.vue',
  'app/components/SiteWordmark.vue',
  'app/components/WayIn.vue',
]

const PUBLIC_DIRECTORIES = ['app/pages/book', 'app/pages/qr', 'app/pages/shows', 'app/pages/waiting-list']

const SHARED_PUBLIC = ['shared/utils/listing.ts', 'shared/utils/programme.ts', 'shared/utils/reservations.ts']

const POLICIES = 'content/policies'

function publicFiles(): string[] {
  const found = [...PUBLIC_GLOBS]
  for (const directory of PUBLIC_DIRECTORIES) {
    const glob = new Bun.Glob('**/*.vue')
    for (const path of glob.scanSync({ cwd: directory, onlyFiles: true })) found.push(`${directory}/${path}`)
  }
  return [...found, ...SHARED_PUBLIC].sort()
}

function policyFiles(): string[] {
  const policies = [...new Bun.Glob('*.md').scanSync({ cwd: POLICIES, onlyFiles: true })].map(path => `${POLICIES}/${path}`)
  // Public help is read by the same visitor as a policy page, so it is held to the same words (0093).
  const help = [...new Bun.Glob('**/*.md').scanSync({ cwd: HELP_ROOT, onlyFiles: true })].map(path => `${HELP_ROOT}/${path}`)
  return [...policies, ...help].sort()
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
    // Text between tags, with the mustaches taken out: their own literals are collected below.
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

async function publicCopy(): Promise<{ file: string, says: string }[]> {
  const copy: { file: string, says: string }[] = []
  for (const file of publicFiles()) {
    for (const says of readerStrings(file, await Bun.file(file).text())) copy.push({ file, says })
  }
  return copy
}

async function policyProse(): Promise<{ file: string, says: string }[]> {
  const prose: { file: string, says: string }[] = []
  for (const file of policyFiles()) {
    const body = (await Bun.file(file).text()).replace(/^---[\s\S]*?^---/m, ' ')
    body.split(/\n\s*\n/).forEach((paragraph) => {
      const says = paragraph.replace(/\s+/g, ' ').trim()
      if (says && !says.startsWith('#')) prose.push({ file, says })
    })
  }
  return prose
}

function offending(copy: { file: string, says: string }[], pattern: RegExp): string[] {
  return copy.filter(one => pattern.test(one.says)).map(one => `${one.file}  ${one.says}`)
}

describe('the reader never reads the estate\'s own words (issue 1152 item 8)', () => {
  test('nothing public calls a booking a reservation', async () => {
    expect(offending(await publicCopy(), /\breservations?\b/i)).toEqual([])
    expect(offending(await policyProse(), /\breservations?\b/i)).toEqual([])
  })

  test('no public string narrates the machine', async () => {
    // copy-style section 5 and the workspace writing rules: the vocabulary the estate keeps for
    // itself. Held to whole words, so a qrToken or a policy token in code is untouched.
    const NARRATION = /\b(ledger|append-only|supersedes?|tombstone|snapshot|the system|this system|the server|the database|schema)\b/i
    expect(offending(await publicCopy(), NARRATION)).toEqual([])
    expect(offending(await policyProse(), NARRATION)).toEqual([])
  })

  test('no public string explains itself', async () => {
    // The instruction goes on screen; the reasoning stays in the decision record.
    const WHY = /\b(because|so that|which is why|on purpose)\b/i
    expect(offending(await publicCopy(), WHY)).toEqual([])
    expect(offending(await policyProse(), WHY)).toEqual([])
  })

  test('nothing public promises something later', async () => {
    const LATER = /\b(not yet|coming soon|arrives with|for now)\b/i
    // The editorial placeholder is the one exception: 0051 gives the committee those pages, and
    // the banner's whole job is to say the words on them are not theirs yet.
    const PLACEHOLDER = 'This page is a placeholder.'
    expect(offending(await publicCopy(), LATER).filter(line => !line.includes(PLACEHOLDER))).toEqual([])
    expect(offending(await policyProse(), LATER)).toEqual([])
  })

  test('no public string contracts a verb', async () => {
    // "What's on" is the season's name, not a contraction of a verb the reader is being told.
    const CONTRACTION = /\b[A-Za-z]+'(t|re|ve|ll|d|m)\b|\b(it|that|here|there)'s\b/i
    expect(offending(await publicCopy(), CONTRACTION)).toEqual([])
  })

  test('no public string counts with a bracketed plural', async () => {
    expect(offending(await publicCopy(), /\w\(s\)/)).toEqual([])
  })

  test('no public screen names a story or a decision record', async () => {
    expect(offending(await policyProse(), /\(\s*[A-Z]-\d{3}\s*\)/)).toEqual([])
  })
})

describe('one word for one thing on the public shell (K-128 criterion 2)', () => {
  test('a full house is said once, by saysAvailability', async () => {
    // A file may spell the words only if it is the one that words the state, or if it takes them
    // from that function; every other screen reads what the projection already carries.
    const derived: string[] = []
    for (const file of publicFiles()) {
      if ((await Bun.file(file).text()).includes('saysAvailability')) derived.push(file)
    }
    const offenders = offending(await publicCopy(), /\b(House full|Sold out)\b/)
      .filter(line => !derived.some(file => line.startsWith(file)))
    expect(offenders).toEqual([])
  })

  test('saysAvailability is the one place a full house is worded', async () => {
    const programme = await Bun.file('shared/utils/programme.ts').text()
    expect(programme).toContain('\'Sold out\'')
    expect(await Bun.file('shared/utils/listing.ts').text()).not.toContain('House full')
  })

  test('the show page has one phrasing for a fact nobody has settled', async () => {
    const show = await Bun.file('app/pages/shows/[slug].vue').text()
    for (const bespoke of ['to be announced', 'Not yet confirmed', 'Not yet priced', 'None stated', 'Interval not yet confirmed']) {
      expect(`${bespoke}: ${show.includes(bespoke)}`).toBe(`${bespoke}: false`)
    }
    expect(show).toContain('TO_BE_CONFIRMED')
  })

  test('paying at the box office is one sentence, held in one place', async () => {
    const programme = await Bun.file('shared/utils/programme.ts').text()
    expect(programme).toContain('SAYS_PAYMENT')
    const offenders = offending(await publicCopy(), /\b(takes payment|Settle up|paid online|Payment is taken)\b/i)
      .filter(line => !line.startsWith('shared/utils/programme.ts'))
    expect(offenders).toEqual([])
  })

  test('no order line is drawn for nothing paid', async () => {
    expect(await Bun.file('app/pages/book/[performanceId].vue').text()).not.toContain('Paid online')
  })

  test('the theatre speaks as we', async () => {
    expect(offending(await publicCopy(), /\bThe theatre (made|never|takes|holds)\b/)).toEqual([])
  })

  test('a button is a verb and an object, never a verb alone', async () => {
    const BARE = /^(Pick|Confirm|Change it|Set it|Book elsewhere|Submit|Release)$/
    const offenders = (await publicCopy()).filter(one => BARE.test(one.says)).map(one => `${one.file}  ${one.says}`)
    expect(offenders).toEqual([])
  })

  test('a sign-in method with no last use does not say so in the machine\'s words', async () => {
    expect(await Bun.file('app/components/SignInMethods.vue').text()).not.toContain('not recorded')
  })

  test('a collected booking reads as paid', async () => {
    expect(await Bun.file('shared/utils/reservations.ts').text()).not.toContain('Collected at the box office')
    expect(await Bun.file('app/pages/qr/index.vue').text()).not.toContain('has been collected')
  })
})

describe('a refusal reads as a sentence (copy-style section 5)', () => {
  test('no page throws a No such X', async () => {
    const glob = new Bun.Glob('**/*.vue')
    const offenders: string[] = []
    for (const path of glob.scanSync({ cwd: 'app', onlyFiles: true })) {
      const source = await Bun.file(`app/${path}`).text()
      for (const [, message] of source.matchAll(/statusMessage:\s*'([^']*)'/g)) {
        if (/^No such /.test(message ?? '')) offenders.push(`app/${path}  ${message}`)
      }
    }
    expect(offenders).toEqual([])
  })

  test('a comp request names the officer who decides in Title Case', async () => {
    const glob = new Bun.Glob('**/*.ts')
    const offenders: string[] = []
    for (const path of glob.scanSync({ cwd: 'server/api/box-office/desk', onlyFiles: true })) {
      const source = await Bun.file(`server/api/box-office/desk/${path}`).text()
      for (const [, message] of source.matchAll(/statusMessage:\s*'([^']*)'/g)) {
        if (/ticketing manager/.test(message ?? '')) offenders.push(`server/api/box-office/desk/${path}  ${message}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
