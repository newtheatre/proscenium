import { RESERVATION_REFERENCE_LENGTH } from './reservations'

// Door mode's own pure logic (E-129): what a camera hands the door, and what the verdict card is
// allowed to say. Four code forms reach it, listed on `ScannedKind` below.

// A token is a credential, so the browser never unpacks one: the door sends it to
// `/api/tonight/door/resolve`, which verifies the signature and answers with the reference.
export type ScannedKind = 'REFERENCE' | 'BOOKING_TOKEN' | 'PASS_TOKEN'

export interface ScannedCode { kind: ScannedKind, value: string }

const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const REFERENCE_SHAPE = new RegExp(`^[${REFERENCE_ALPHABET}]{${RESERVATION_REFERENCE_LENGTH}}$`)

// A second decode of the same code inside this window is the same physical scan, not a second
// patron: a phone screen sits in front of the lens for a second or two (criterion 3).
export const SCAN_REPEAT_WINDOW_MS = 4000

// The path of an absolute or a relative URL, or null when the text is not one at all. A bare
// reference has no slash, so it never reaches the URL parser.
function pathOf(raw: string): string | null {
  if (!raw.includes('/')) return null
  try {
    return new URL(raw, 'https://newtheatre.org.uk').pathname
  }
  catch {
    return null
  }
}

function segmentAfter(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null
  const rest = path.slice(prefix.length).replace(/\/+$/, '')
  return rest.length > 0 && !rest.includes('/') ? rest : null
}

export function readScannedCode(raw: string): ScannedCode | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  const path = pathOf(trimmed)
  if (path) {
    const booking = segmentAfter(path, '/qr/')
    if (booking) return { kind: 'BOOKING_TOKEN', value: booking }
    const pass = segmentAfter(path, '/passes/')
    if (pass) return { kind: 'PASS_TOKEN', value: pass }
    const referenced = segmentAfter(path, '/t/')
    if (referenced && REFERENCE_SHAPE.test(referenced.toUpperCase())) {
      return { kind: 'REFERENCE', value: referenced.toUpperCase() }
    }
    return null
  }

  const upper = trimmed.toUpperCase()
  return REFERENCE_SHAPE.test(upper) ? { kind: 'REFERENCE', value: upper } : null
}

// Whether a decode is the same code the lens was already looking at. The caller keeps the last
// value and the moment it was taken; nothing here holds state.
export function isRepeatScan(
  last: { value: string, at: number } | null,
  value: string,
  at: number,
  windowMs = SCAN_REPEAT_WINDOW_MS,
): boolean {
  return last !== null && last.value === value && at - last.at < windowMs
}

// The three answers door mode gives. Admit, send to the bar, or refuse with the reason named:
// there is no fourth, and none of them carries a figure (show-night design 2.1).
export type DoorVerdictState = 'PAID' | 'UNPAID' | 'REFUSED'

export interface DoorVerdict { state: DoorVerdictState, headline: string, line: string, note: string | null }

// `unpaid` is the caller's own read of the booking, not a guess from wording: the box office's
// copy names the amount due, which the door may never show (E-129 criterion 7).
export function doorVerdict(
  outcome: { headline: string, detail: string | null, admit: boolean },
  unpaid: boolean,
): DoorVerdict {
  if (outcome.admit) return { state: 'PAID', headline: 'PAID', line: 'All collected, admit', note: null }
  if (unpaid) {
    return {
      state: 'UNPAID',
      headline: 'UNPAID',
      line: 'Send to the bar to pay',
      note: 'The bar takes card or cash and marks the booking paid.',
    }
  }
  return { state: 'REFUSED', headline: outcome.headline.toUpperCase(), line: outcome.detail ?? outcome.headline, note: null }
}

// A pass admits its holder and nobody else (D-126 criterion 4), so the card's own button says so
// rather than offering a number to change.
export const PASS_ADMISSION_PARTY_SIZE = 1

export const PASS_ADMISSION_CAPTION = 'Creates tonight\'s £0 pass-admission ticket.'

// What the card says a pass covers. A fellowship covers everything the theatre puts on, which is
// why it carries no rows of its own (D-130, 0023).
export function saysPassCoverage(passTypeSlug: string, coveredCount: number): string {
  if (passTypeSlug === 'fellowship') return 'All in-house shows'
  if (coveredCount === 0) return 'No shows yet'
  return coveredCount === 1 ? '1 show' : `${coveredCount} shows`
}

// Tonight's own line, which is the one the volunteer reads before pressing Admit. `DOOR` is the
// status an admitted seat carries, so a redeemed-but-not-arrived pass reads differently.
export function saysPassTonight(tonightAt: number | null, tonightStatus: string | null): { line: string, admitted: boolean } {
  if (tonightAt === null) return { line: 'Not yet redeemed', admitted: false }
  if (tonightStatus === 'DOOR') return { line: 'Already admitted tonight', admitted: true }
  if (tonightStatus === 'PENDING' || tonightStatus === 'COLLECTED') return { line: 'Redeemed, not yet through the door', admitted: false }
  return { line: 'Tonight\'s admission was cancelled', admitted: true }
}

// A pass admits its holder and nobody else, and costs nothing, so its admitted verdict has one
// shape. The holder's own name belongs to pass mode's card, not to this one (D-126).
export function admittedPassVerdict(reference: string): {
  reference: string
  verdict: DoorVerdict
  holderName: string | null
  partySize: number
} {
  return {
    reference: reference.toUpperCase(),
    verdict: doorVerdict({ headline: 'Admit', detail: null, admit: true }, false),
    holderName: null,
    partySize: 1,
  }
}

// The pill on the verdict card: who the door is expecting and how many of them. A first name and
// a count is the whole of what door mode may show about a person (show-night design 2.1, 4).
export function saysDoorParty(holderName: string | null, partySize: number): string {
  const first = holderName?.trim().split(/\s+/)[0]
  const party = `party of ${partySize}`
  return first ? `${first} · ${party}` : party[0]!.toUpperCase() + party.slice(1)
}
