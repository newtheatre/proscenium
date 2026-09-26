import { describe, expect, test } from 'bun:test'
import {
  admittedPassVerdict,
  CAMERA_FALLBACK_SAYS,
  DOOR_MISS_LINE,
  DOOR_SEARCH_MAX,
  doorFailureVerdict,
  doorMissVerdict,
  doorNameTerm,
  doorTicketFound,
  lookUpOutcome,
  doorVerdict,
  isRepeatScan,
  readScannedCode,
  saysDoorParty,
  saysPassCoverage,
  saysPassTonight,
  SCAN_REPEAT_WINDOW_MS,
  verdictBuzz,
  verdictHoldMs,
} from '#shared/utils/door'

// E-129 criteria 2 and 3: what a decoded QR resolves to, and why one code held in front of the
// lens admits once. The camera itself is not here; this is the pure half.

const BASE = 'https://newtheatre.org.uk'
const TOKEN = 'r-abc123.sIgNaTuRe_-09'

describe('a decoded value resolves to one of the four forms the door knows (criterion 2)', () => {
  test('this build\'s own booking URL is a signed token, not a reference', () => {
    expect(readScannedCode(`${BASE}/qr/${TOKEN}`)).toEqual({ kind: 'BOOKING_TOKEN', value: TOKEN })
  })

  test('a pass URL is its own kind, so neither resolves against the other\'s route', () => {
    expect(readScannedCode(`${BASE}/passes/${TOKEN}`)).toEqual({ kind: 'PASS_TOKEN', value: TOKEN })
  })

  test('the /t/<ref> form the design names resolves to the reference itself', () => {
    expect(readScannedCode(`${BASE}/t/K7M4PQ`)).toEqual({ kind: 'REFERENCE', value: 'K7M4PQ' })
  })

  test('a bare reference is a reference, and case never matters', () => {
    expect(readScannedCode('k7m4pq')).toEqual({ kind: 'REFERENCE', value: 'K7M4PQ' })
  })

  test('surrounding whitespace from a scanner is trimmed', () => {
    expect(readScannedCode('  K7M4PQ\n')).toEqual({ kind: 'REFERENCE', value: 'K7M4PQ' })
  })

  test('a relative path decodes the same way an absolute URL does', () => {
    expect(readScannedCode(`/qr/${TOKEN}`)).toEqual({ kind: 'BOOKING_TOKEN', value: TOKEN })
  })

  test('a host we do not serve is read for its path, since the code is verified server-side anyway', () => {
    expect(readScannedCode(`https://example.com/t/K7M4PQ`)).toEqual({ kind: 'REFERENCE', value: 'K7M4PQ' })
  })
})

describe('anything the door cannot act on decodes to nothing, never to a guess', () => {
  test('an empty or blank code', () => {
    expect(readScannedCode('')).toBeNull()
    expect(readScannedCode('   ')).toBeNull()
  })

  test('a URL of ours that is not a booking, a pass or a ticket path', () => {
    expect(readScannedCode(`${BASE}/whats-on`)).toBeNull()
  })

  test('a /t/ path carrying something that is not a reference', () => {
    expect(readScannedCode(`${BASE}/t/not-a-reference`)).toBeNull()
  })

  test('the look-alike characters the reference alphabet excludes', () => {
    expect(readScannedCode('K7M4P0')).toBeNull()
    expect(readScannedCode('K7M4PO')).toBeNull()
    expect(readScannedCode('K7M4PI')).toBeNull()
  })

  test('a reference of the wrong length', () => {
    expect(readScannedCode('K7M4P')).toBeNull()
    expect(readScannedCode('K7M4PQR')).toBeNull()
  })

  test('an unrelated URL with a deeper path under ours', () => {
    expect(readScannedCode(`${BASE}/qr/one/two`)).toBeNull()
  })
})

describe('one code in front of the lens admits once (criterion 3)', () => {
  test('nothing scanned yet is never a repeat', () => {
    expect(isRepeatScan(null, 'K7M4PQ', 1000)).toBe(false)
  })

  test('the same code again inside the window is ignored', () => {
    expect(isRepeatScan({ value: 'K7M4PQ', at: 1000 }, 'K7M4PQ', 1000 + SCAN_REPEAT_WINDOW_MS - 1)).toBe(true)
  })

  test('the same code again after the window is a fresh scan', () => {
    expect(isRepeatScan({ value: 'K7M4PQ', at: 1000 }, 'K7M4PQ', 1000 + SCAN_REPEAT_WINDOW_MS)).toBe(false)
  })

  test('a different code is never suppressed, however fast it follows', () => {
    expect(isRepeatScan({ value: 'K7M4PQ', at: 1000 }, 'QP4M7K', 1001)).toBe(false)
  })
})

describe('door mode answers admit or redirect, and never with a figure (criterion 7)', () => {
  test('a paid booking is PAID and says so in the words the door reads out', () => {
    expect(doorVerdict({ headline: 'Admit', detail: null, admit: true }, false))
      .toEqual({ state: 'PAID', headline: 'PAID', line: 'Paid, admit', note: null })
  })

  test('an unpaid booking points at the bar, and the amount due never reaches the screen', () => {
    const verdict = doorVerdict({ headline: 'Unpaid', detail: '£9.00 due at the box office on the night.', admit: false }, true)
    expect(verdict.state).toBe('UNPAID')
    expect(verdict.line).toBe('Send to the bar with this ticket')
    expect(`${verdict.headline}${verdict.line}${verdict.note}`).not.toContain('£')
    expect(verdict.note).not.toMatch(/cash/i)
  })

  test('any other refusal names its own reason', () => {
    expect(doorVerdict({ headline: 'Wrong performance', detail: 'This ticket is for The Seagull, Friday.', admit: false }, false))
      .toEqual({ state: 'REFUSED', headline: 'WRONG PERFORMANCE', line: 'This ticket is for The Seagull, Friday.', note: null })
  })

  test('a refusal with no detail of its own still says something', () => {
    expect(doorVerdict({ headline: 'Cancelled', detail: null, admit: false }, false).line).toBe('Cancelled')
  })

  test('admitting wins over unpaid: an admitted booking is never sent to the bar', () => {
    expect(doorVerdict({ headline: 'Admit', detail: null, admit: true }, true).state).toBe('PAID')
  })
})

describe('the verdict card names a first name and a count, and nothing else about a person', () => {
  test('a first name and the party it admits', () => {
    expect(saysDoorParty('Robin Goodfellow', 3)).toBe('Robin · party of 3')
  })

  test('a one-word name is the first name', () => {
    expect(saysDoorParty('Robin', 1)).toBe('Robin · party of 1')
  })

  test('a booking with no name behind it still says how many to expect', () => {
    expect(saysDoorParty(null, 2)).toBe('Party of 2')
    expect(saysDoorParty('   ', 2)).toBe('Party of 2')
  })
})

describe('what the pass card says a pass covers (D-126)', () => {
  test('a fellowship covers everything the theatre puts on, and carries no rows of its own', () => {
    expect(saysPassCoverage('fellowship', 0)).toBe('All in-house shows')
  })

  test('an ordinary pass counts the shows named on it', () => {
    expect(saysPassCoverage('season-26-27', 1)).toBe('1 show')
    expect(saysPassCoverage('season-26-27', 6)).toBe('6 shows')
  })

  test('a product with nothing named on it yet says so rather than claiming everything', () => {
    expect(saysPassCoverage('season-26-27', 0)).toBe('No shows yet')
  })
})

describe('what the card says about tonight, which is what the volunteer reads before admitting', () => {
  test('never redeemed for this performance', () => {
    expect(saysPassTonight(null, null)).toEqual({ line: 'Not yet redeemed', admitted: false })
  })

  test('redeemed and already through the door: admitting again is refused (criterion 4)', () => {
    expect(saysPassTonight(1000, 'DOOR')).toEqual({ line: 'Already admitted tonight', admitted: true })
  })

  test('redeemed but not yet arrived: the seat exists and the door still has a job', () => {
    expect(saysPassTonight(1000, 'PENDING').admitted).toBe(false)
    expect(saysPassTonight(1000, 'COLLECTED').admitted).toBe(false)
  })

  test('an admission cancelled since is named, not silently treated as free', () => {
    expect(saysPassTonight(1000, 'CANCELLED')).toEqual({ line: 'Tonight\'s admission was cancelled', admitted: true })
  })
})

describe('no answer is not a refusal (E-129 criterion 7, issue 1145)', () => {
  test('a transport failure, with no status at all, is shown as unanswered rather than refused', () => {
    const verdict = doorFailureVerdict(undefined, 'That did not work. Try again.')
    expect(verdict.state).toBe('UNANSWERED')
    expect(verdict.headline).not.toContain('OURS')
    expect(verdict.line).toContain('Try again')
  })

  test('a refusal the server actually gave keeps its own words', () => {
    const verdict = doorFailureVerdict(409, 'This pass has expired.')
    expect(verdict).toEqual({ state: 'REFUSED', headline: 'REFUSED', line: 'This pass has expired.', note: null })
  })

  // Issue 1301: nothing found is amber, since no booking or pass stands behind it to refuse, and
  // it ends in the next step rather than the route's own sentence.
  test('nothing found, by the lookup or by the code itself, is the miss with its own next step', () => {
    expect(doorFailureVerdict(404, 'That reference is not recognised.')).toEqual(doorMissVerdict())
    expect(doorFailureVerdict(422, 'That code is not one of ours')).toEqual(doorMissVerdict())
    expect(doorMissVerdict().line).toBe(DOOR_MISS_LINE)
  })
})

describe('a lookup that failed is never read as nothing found (issue 1145, issue 1301)', () => {
  const empty = { status: 'fulfilled' as const, value: { items: [] as string[] } }
  const refused = { status: 'rejected' as const, reason: new Error('refused') }

  test('both halves empty is nothing found', () => {
    expect(lookUpOutcome(empty, empty)).toEqual({ kind: 'MISS' })
  })

  test('one half failed and the other empty is that half\'s failure, never a miss', () => {
    expect(lookUpOutcome(refused, empty)).toEqual({ kind: 'FAILED', reason: refused.reason })
    expect(lookUpOutcome(empty, refused)).toEqual({ kind: 'FAILED', reason: refused.reason })
  })

  test('whatever one half found is listed, even when the other half failed', () => {
    expect(lookUpOutcome({ status: 'fulfilled', value: { items: ['K7M4PQ'] } }, refused))
      .toEqual({ kind: 'FOUND', tickets: ['K7M4PQ'], passes: [] })
  })
})

describe('a miss is amber and says what to try next (issue 1301)', () => {
  test('the miss names nothing found and points at the spelling or the reference', () => {
    const verdict = doorMissVerdict()
    expect(verdict.state).toBe('MISS')
    expect(verdict.headline).toBe('NOT FOUND')
    expect(verdict.line.toLowerCase()).toContain('spelling')
  })

  test('a miss holds long enough to read, and buzzes unlike any other verdict', () => {
    expect(verdictHoldMs('MISS')).toBe(verdictHoldMs('REFUSED'))
    expect(verdictBuzz('MISS').join(',')).not.toBe(verdictBuzz('REFUSED').join(','))
  })
})

describe('a pass admits in its own word, never PAID (issue 1301)', () => {
  test('the card reads PASS, admit, for the holder alone', () => {
    const admitted = admittedPassVerdict('gj877s')
    expect(admitted.verdict).toEqual({ state: 'PAID', headline: 'PASS', line: 'Pass, admit', note: null })
    expect(admitted.reference).toBe('GJ877S')
    expect(admitted.partySize).toBe(1)
  })
})

describe('the one door field reads a code, and a name when it could be one (issue 1301)', () => {
  test('a name is looked up as typed', () => {
    expect(doorNameTerm('  Mira ')).toBe('Mira')
  })

  test('a six-letter name is a reference shape too, so it may still be looked up as a name', () => {
    expect(readScannedCode('HANNAH')).not.toBeNull()
    expect(doorNameTerm('Hannah')).toBe('Hannah')
  })

  test('a URL is never a name, and nor is anything outside the search\'s bounds', () => {
    expect(doorNameTerm('https://newtheatre.org.uk/t/K7M4PQ')).toBeNull()
    expect(doorNameTerm('M')).toBeNull()
    expect(doorNameTerm('M'.repeat(DOOR_SEARCH_MAX + 1))).toBeNull()
  })

  // D1 counts the LIKE limit in bytes, with escapes and the two wildcards (0081).
  test('the bound is the pattern\'s bytes, so accents and escapes count', () => {
    expect(doorNameTerm('M'.repeat(DOOR_SEARCH_MAX))).not.toBeNull()
    expect(doorNameTerm('É'.repeat(DOOR_SEARCH_MAX / 2 + 1))).toBeNull()
    expect(doorNameTerm('%'.repeat(DOOR_SEARCH_MAX / 2 + 1))).toBeNull()
  })
})

describe('a ticket found by name says paid, unpaid or in, with a first name only (issue 1301)', () => {
  const row = { reference: 'K7M4PQ', holderName: 'Mira Halvorsen', partySize: 2, admittedAt: null }
  // 19:12 on Thursday 5 November 2026, winter time, so London and UTC agree.
  const admittedAt = Math.floor(Date.UTC(2026, 10, 5, 19, 12) / 1000)

  test('a paid booking is there to admit', () => {
    expect(doorTicketFound({ ...row, status: 'COLLECTED' }))
      .toEqual({ reference: 'K7M4PQ', firstName: 'Mira', partySize: 2, state: 'PAID', line: 'Paid, admit' })
  })

  test('an unpaid one is sent to the bar, and names no amount', () => {
    const found = doorTicketFound({ ...row, status: 'PENDING' })
    expect(found.state).toBe('UNPAID')
    expect(found.line).toBe('Send to the bar with this ticket')
  })

  test('one already through the door says when', () => {
    const found = doorTicketFound({ ...row, status: 'DOOR', admittedAt })
    expect(found.state).toBe('ADMITTED')
    expect(found.line).toBe('Already admitted at 19:12')
  })

  test('the surname never leaves the lookup', () => {
    expect(JSON.stringify(doorTicketFound({ ...row, status: 'COLLECTED' }))).not.toContain('Halvorsen')
  })
})

describe('the verdict clears itself, and a reason is held long enough to read (issue 1150 item 1)', () => {
  test('an admitting verdict is gone before the same code could be read a second time', () => {
    expect(verdictHoldMs('PAID')).toBeGreaterThanOrEqual(3000)
    expect(verdictHoldMs('PAID')).toBeLessThan(SCAN_REPEAT_WINDOW_MS)
  })

  test('unpaid holds for as long as paid: both are read in one glance', () => {
    expect(verdictHoldMs('UNPAID')).toBe(verdictHoldMs('PAID'))
  })

  test('a refusal and a dropped connection hold longer, because the reason is the whole point', () => {
    expect(verdictHoldMs('REFUSED')).toBeGreaterThan(verdictHoldMs('PAID'))
    expect(verdictHoldMs('UNANSWERED')).toBe(verdictHoldMs('REFUSED'))
  })
})

describe('each verdict buzzes differently, so a phone held at arm\'s length is read by hand (issue 1150 item 1)', () => {
  test('one buzz admits', () => {
    expect(verdictBuzz('PAID')).toHaveLength(1)
  })

  test('unpaid is two buzzes, which is a pause between two lengths', () => {
    expect(verdictBuzz('UNPAID')).toHaveLength(3)
  })

  test('a refusal is one long buzz, longer than the admitting one', () => {
    expect(verdictBuzz('REFUSED')).toHaveLength(1)
    expect(verdictBuzz('REFUSED')[0]!).toBeGreaterThan(verdictBuzz('PAID')[0]!)
  })

  test('no answer buzzes not at all, since nothing was decided', () => {
    expect(verdictBuzz('UNANSWERED')).toEqual([])
  })

  test('no two verdicts share a pattern', () => {
    const patterns = (['PAID', 'UNPAID', 'REFUSED', 'UNANSWERED', 'MISS'] as const).map(state => verdictBuzz(state).join(','))
    expect(new Set(patterns).size).toBe(patterns.length)
  })
})

describe('one set of camera-failure sentences, in the show-night register (issue 1150 item 2)', () => {
  const sentences = Object.values(CAMERA_FALLBACK_SAYS)

  test('a device with no camera, a refused one and a broken one each read differently', () => {
    expect(new Set(sentences).size).toBe(3)
  })

  test('each is two sentences, and each sentence carries its stop', () => {
    for (const says of sentences) {
      const parts = says.split('. ')
      expect(parts).toHaveLength(2)
      expect(says.endsWith('.')).toBe(true)
    }
  })

  test('none of them explains itself: the instruction is on screen, the reasoning is not', () => {
    for (const says of sentences) expect(says).not.toMatch(/\bso\b/i)
  })

  test('each one says what to do instead', () => {
    for (const says of sentences) expect(says.toLowerCase()).toContain('type the reference')
  })
})

// Issue 1151 item 9: the desk kept three sentences of its own beside the shared ones, so one
// camera failure read one way at the door and another at the box office.
describe('no screen spells its own camera-failure sentences', () => {
  function appFiles(): string[] {
    const glob = new Bun.Glob('**/*.{vue,ts}')
    return [...glob.scanSync({ cwd: 'app', onlyFiles: true })].map(path => `app/${path}`).sort()
  }

  test('the shared map is the only map of a scanner failure to words', async () => {
    const offenders: string[] = []
    for (const file of appFiles()) {
      if ((await Bun.file(file).text()).includes('Record<ScannerFailure, string>')) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  // Setting the note is the test, not showing one: a pane handed the note as a prop spells nothing.
  const SETS_NOTE = 'cameraNote.value ='

  test('every screen that sets a camera note takes that note from the shared map', async () => {
    const offenders: string[] = []
    for (const file of appFiles()) {
      const source = await Bun.file(file).text()
      if (source.includes(SETS_NOTE) && !source.includes('CAMERA_FALLBACK_SAYS')) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
