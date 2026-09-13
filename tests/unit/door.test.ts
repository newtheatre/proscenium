import { describe, expect, test } from 'bun:test'
import {
  doorVerdict,
  isRepeatScan,
  readScannedCode,
  saysDoorParty,
  saysPassCoverage,
  saysPassTonight,
  SCAN_REPEAT_WINDOW_MS,
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
  test('a collected booking is PAID and says so in the words the door reads out', () => {
    expect(doorVerdict({ headline: 'Admit', detail: null, admit: true }, false))
      .toEqual({ state: 'PAID', headline: 'PAID', line: 'All collected, admit', note: null })
  })

  test('an unpaid booking points at the bar, and the amount due never reaches the screen', () => {
    const verdict = doorVerdict({ headline: 'Unpaid', detail: '£9.00 due at the box office on the night.', admit: false }, true)
    expect(verdict.state).toBe('UNPAID')
    expect(verdict.line).toBe('Send to the bar to pay')
    expect(`${verdict.headline}${verdict.line}${verdict.note}`).not.toContain('£')
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
