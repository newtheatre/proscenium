import { firstNameOf } from './night-hub'
import { RESERVATION_REFERENCE_LENGTH } from './reservations'
import { plural } from './text'

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

// How long a verdict sits over the viewfinder. Shorter than the repeat window, so one code held
// in front of the lens cannot read a second time into a card still showing its first answer.
export const VERDICT_HOLD_MS = 3500

// A refusal and a dropped connection are read, not glanced at: the volunteer has to say why.
export const VERDICT_HOLD_REASON_MS = 8000

// Why the camera is not open, in the show-night register. One set, held here so that the screens
// opening a camera cannot drift into a wording each.
export type ScannerFailure = 'NO_CAMERA' | 'REFUSED' | 'BROKEN'

export const CAMERA_FALLBACK_SAYS: Record<ScannerFailure, string> = {
  NO_CAMERA: 'No camera. Type the reference.',
  REFUSED: 'Camera not allowed. Type the reference.',
  BROKEN: 'Camera did not start. Type the reference.',
}

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

// The three answers door mode gives: admit, send to the bar, or refuse naming the reason, never a
// figure (show-night design 2.1). UNANSWERED is no answer at all; MISS is nothing found (issue 1301).
export type DoorVerdictState = 'PAID' | 'UNPAID' | 'REFUSED' | 'UNANSWERED' | 'MISS'

export interface DoorVerdict { state: DoorVerdictState, headline: string, line: string, note: string | null }

export const DOOR_TO_THE_BAR = 'Send to the bar with this ticket'

// `unpaid` is the caller's own read of the booking, not a guess from wording: the box office's
// copy names the amount due, which the door may never show (E-129 criterion 7).
export function doorVerdict(
  outcome: { headline: string, detail: string | null, admit: boolean },
  unpaid: boolean,
): DoorVerdict {
  if (outcome.admit) return { state: 'PAID', headline: 'PAID', line: 'Paid, admit', note: null }
  if (unpaid) {
    return {
      state: 'UNPAID',
      headline: 'UNPAID',
      line: DOOR_TO_THE_BAR,
      note: 'The bar takes card and marks the booking paid.',
    }
  }
  return { state: 'REFUSED', headline: outcome.headline.toUpperCase(), line: outcome.detail ?? outcome.headline, note: null }
}

export const DOOR_MISS_LINE = 'Nothing tonight matches. Check the spelling or the reference.'

// Nothing found is amber, never red: no booking or pass stands behind it to refuse (issue 1301).
export function doorMissVerdict(line = DOOR_MISS_LINE): DoorVerdict {
  return { state: 'MISS', headline: 'NOT FOUND', line, note: null }
}

// A request that never got an answer is not a refusal: the ticket may be perfectly good, and a
// red card would send its holder to the bar for nothing (issue 1145). Nor is a lookup that missed.
export function doorFailureVerdict(status: number | undefined, line: string, refusedHeadline = 'REFUSED'): DoorVerdict {
  if (status === undefined) {
    return { state: 'UNANSWERED', headline: 'NO ANSWER', line: 'The connection dropped, so nothing was checked. Try again.', note: null }
  }
  if (status === 404 || status === 422) return doorMissVerdict(line)
  return { state: 'REFUSED', headline: refusedHeadline, line, note: null }
}

// How long the overlay holds before clearing itself. A tap or the next different code clears it
// sooner; nothing holds for ever, because the queue is the point (issue 1150 item 1).
export function verdictHoldMs(state: DoorVerdictState): number {
  return state === 'PAID' || state === 'UNPAID' ? VERDICT_HOLD_MS : VERDICT_HOLD_REASON_MS
}

// What the phone buzzes, in `navigator.vibrate`'s own on-off milliseconds, so a verdict reaches a
// volunteer who is looking at the patron rather than the screen.
export const VERDICT_BUZZ: Record<DoorVerdictState, number[]> = {
  PAID: [40],
  UNPAID: [40, 120, 40],
  REFUSED: [400],
  UNANSWERED: [],
  MISS: [150, 100, 150],
}

export function verdictBuzz(state: DoorVerdictState): number[] {
  return VERDICT_BUZZ[state]
}

// A pass admits its holder and nobody else (D-126 criterion 4), so the card's own button says so
// rather than offering a number to change.
export const PASS_ADMISSION_PARTY_SIZE = 1

// What the card says a pass covers. A fellowship covers everything the theatre puts on, which is
// why it carries no rows of its own (D-130, 0023).
export function saysPassCoverage(passTypeSlug: string, coveredCount: number): string {
  if (passTypeSlug === 'fellowship') return 'All in-house shows'
  if (coveredCount === 0) return 'No shows yet'
  return plural(coveredCount, 'show')
}

// Tonight's own line, which is the one the volunteer reads before pressing Admit. `DOOR` is the
// status an admitted seat carries, so a redeemed-but-not-arrived pass reads differently.
export function saysPassTonight(tonightAt: number | null, tonightStatus: string | null): { line: string, admitted: boolean } {
  if (tonightAt === null) return { line: 'Not yet redeemed', admitted: false }
  if (tonightStatus === 'DOOR') return { line: 'Already admitted tonight', admitted: true }
  if (tonightStatus === 'PENDING' || tonightStatus === 'COLLECTED') return { line: 'Redeemed, not yet in', admitted: false }
  return { line: 'Tonight\'s admission was cancelled', admitted: true }
}

// One card of `GET /api/tonight/door/passes/search`, read by the door's results (D-126).
export interface DoorPassCard {
  id: string
  reference: string
  holderName: string
  passTypeName: string
  covers: string
  active: boolean
  tonight: string
  admittedTonight: boolean
  lastUsed: string | null
  refusal: string | null
}

export interface DoorAdmission { reference: string, verdict: DoorVerdict, holderName: string | null, partySize: number }

// A pass admits its holder and nobody else, and costs nothing, so it admits in its own word
// rather than PAID (issue 1301). The holder's name belongs to the pass card, not to this one.
export function admittedPassVerdict(reference: string): {
  reference: string
  verdict: DoorVerdict
  holderName: string | null
  partySize: number
} {
  return {
    reference: reference.toUpperCase(),
    verdict: { state: 'PAID', headline: 'PASS', line: 'Pass, admit', note: null },
    holderName: null,
    partySize: 1,
  }
}

// The pill on the verdict card: who the door is expecting and how many of them. A first name and
// a count is the whole of what door mode may show about a person (show-night design 2.1, 4).
export function saysDoorParty(holderName: string | null, partySize: number): string {
  const first = firstNameOf(holderName)
  const party = `party of ${partySize}`
  return first ? `${first} · ${party}` : party[0]!.toUpperCase() + party.slice(1)
}

// The one door field's name lookup (issue 1301). The upper bound keeps the pattern inside D1's
// fifty-character LIKE limit once it is wrapped for a contains match.
export const DOOR_SEARCH_MIN = 2
export const DOOR_SEARCH_MAX = 40

// A typed entry may also be a name: a six-letter one is a reference shape too. A URL never is,
// and a term outside the lookup's bounds is not sent.
export function doorNameTerm(typed: string): string | null {
  const term = typed.trim()
  if (term.includes('/') || term.length < DOOR_SEARCH_MIN || term.length > DOOR_SEARCH_MAX) return null
  return term
}

export type DoorFoundState = 'PAID' | 'UNPAID' | 'ADMITTED'

export interface DoorTicketFound {
  reference: string
  firstName: string | null
  partySize: number
  state: DoorFoundState
  line: string
}

// A ticket the name lookup found: a first name, a count, and paid, unpaid or in (E-129 criterion
// 7). `admittedAt` is already the door's own clock time, or null.
export function doorTicketFound(row: {
  reference: string
  holderName: string | null
  partySize: number
  status: string
  admittedAt: string | null
}): DoorTicketFound {
  const found = { reference: row.reference, firstName: firstNameOf(row.holderName), partySize: row.partySize }
  if (row.status === 'DOOR') {
    return { ...found, state: 'ADMITTED', line: row.admittedAt ? `Already admitted at ${row.admittedAt}` : 'Already admitted tonight' }
  }
  if (row.status === 'PENDING') return { ...found, state: 'UNPAID', line: DOOR_TO_THE_BAR }
  return { ...found, state: 'PAID', line: 'Paid, admit' }
}
