import { describe, expect, test } from 'bun:test'
import {
  DESK_SALE_LINE_QUANTITY_CAP,
  DESK_SCAN_PASS_REFUSAL,
  DESK_SCAN_UNKNOWN_REFUSAL,
  REINSTATE_REASON_LIMIT,
  amountDueFor,
  collectForm,
  compBlockedSays,
  deskEmptySays,
  deskSaleForm,
  deskSearchForm,
  readDeskScan,
  saysDeskNight,
  walkUpRefusal,
  walkUpTotalPence,
  refundTicketForm,
  reinstateRefusal,
  reinstateReservationForm,
  strandedMoneyReason,
  uncollectableReason,
} from '#shared/utils/desk'
import { RESERVATION_STATUSES } from '#shared/utils/capacity'

// D-114 as pure rules. The database enforcement (the ticket-collection-once guard) is in
// tests/integration/desk.test.ts; the full desk flow is tests/e2e/desk.test.ts.

describe('a booking is collectable only while PENDING (criterion 2)', () => {
  test('PENDING has nothing to refuse', () => {
    expect(uncollectableReason('PENDING')).toBeNull()
  })

  test('every other status refuses, each in its own words', () => {
    const reasons = ['COLLECTED', 'DOOR', 'CANCELLED', 'EXPIRED', 'NO_SHOW'].map(status => uncollectableReason(status))
    expect(reasons.every(reason => typeof reason === 'string' && reason.length > 0)).toBe(true)
    expect(new Set(reasons).size).toBe(reasons.length)
  })

  test('an unrecognised status still says something rather than nothing', () => {
    expect(uncollectableReason('SOMETHING_NEW')).toContain('cannot be collected')
  })

  // #1037: the till shows these words too, on a screen that never reinstates anything, so no
  // reason may point at a control below it.
  test('no reason sends the reader to something below it', () => {
    const reasons = ['COLLECTED', 'DOOR', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'SOMETHING_NEW']
      .map(status => uncollectableReason(status) ?? '')
    expect(reasons.some(reason => reason.toLowerCase().includes('below'))).toBe(false)
  })

  test('a lapsed hold names who can bring it back', () => {
    expect(uncollectableReason('EXPIRED')).toContain('Box office can reinstate it')
  })
})

describe('what is due now depends on the tender (criterion 4)', () => {
  test('a comp is due nothing, whatever the tickets cost', () => {
    expect(amountDueFor('COMP', 1800)).toBe(0)
  })

  test('a card charges the real total', () => {
    expect(amountDueFor('CARD', 1800)).toBe(1800)
  })
})

describe('a comp needs a reason; a card needs nothing else', () => {
  test('CARD with no reason is a well-formed request', () => {
    expect(collectForm.safeParse({ expectedTotalPence: 900, tender: 'CARD' }).success).toBe(true)
  })

  test('COMP with no request named is refused before it reaches the route', () => {
    expect(collectForm.safeParse({ expectedTotalPence: 0, tender: 'COMP' }).success).toBe(false)
  })

  test('COMP naming an approved request is well-formed', () => {
    expect(collectForm.safeParse({ expectedTotalPence: 0, tender: 'COMP', compRequestId: 'comp-1' }).success).toBe(true)
  })

  test('a tender outside CARD or COMP is refused: the theatre takes no cash', () => {
    expect(collectForm.safeParse({ expectedTotalPence: 900, tender: 'CASH' }).success).toBe(false)
  })
})

describe('the search request is scoped to one performance (criterion 1)', () => {
  test('a performance id is required; a search term is not', () => {
    expect(deskSearchForm.safeParse({ performanceId: 'p-1' }).success).toBe(true)
    expect(deskSearchForm.safeParse({ q: 'Alex' }).success).toBe(false)
  })
})

describe('a refund is a well-formed expected total (D-116 criterion 1)', () => {
  test('a non-negative figure parses', () => {
    expect(refundTicketForm.safeParse({ expectedTotalPence: 900 }).success).toBe(true)
  })

  test('a negative figure is refused before it reaches the route', () => {
    expect(refundTicketForm.safeParse({ expectedTotalPence: -1 }).success).toBe(false)
  })
})

describe('a booking still owing money is not cancelled (D-116 criterion 6)', () => {
  test('nothing stranded has nothing to refuse', () => {
    expect(strandedMoneyReason(0)).toBeNull()
  })

  test('anything still unrefunded quotes the amount', () => {
    const reason = strandedMoneyReason(900)
    expect(reason).toContain('£9.00')
  })
})

describe('only an expired hold or the booker\'s own cancellation reinstates (D-118 criteria 1, 5)', () => {
  test('EXPIRED has nothing to refuse', () => {
    expect(reinstateRefusal('EXPIRED', null)).toBeNull()
  })

  test('a customer\'s own cancellation has nothing to refuse', () => {
    expect(reinstateRefusal('CANCELLED', 'CUSTOMER')).toBeNull()
  })

  test('a staff cancellation refuses: it only ever follows a refund', () => {
    const reason = reinstateRefusal('CANCELLED', 'STAFF')
    expect(reason).toContain('refunded')
  })

  test('a still-pending, collected or no-show booking is not eligible either', () => {
    const reasons = ['PENDING', 'COLLECTED', 'DOOR', 'NO_SHOW'].map(status => reinstateRefusal(status, null))
    expect(reasons.every(reason => typeof reason === 'string' && reason.length > 0)).toBe(true)
  })
})

describe('a reinstatement is a reason, nothing else (D-118 criterion 4)', () => {
  test('a short reason is well-formed', () => {
    expect(reinstateReservationForm.safeParse({ reason: 'Booker was held up on the tram, still coming' }).success).toBe(true)
  })

  test('an empty reason is refused before it reaches the route', () => {
    expect(reinstateReservationForm.safeParse({ reason: '' }).success).toBe(false)
  })

  test('a reason past the limit is refused', () => {
    expect(reinstateReservationForm.safeParse({ reason: 'x'.repeat(REINSTATE_REASON_LIMIT + 1) }).success).toBe(false)
  })

  test('a stray field is refused: nothing else belongs on this request', () => {
    expect(reinstateReservationForm.safeParse({ reason: 'Fine', extra: 'no' }).success).toBe(false)
  })
})

describe('a walk-up sale allows up to 20 a line and no order total cap (D-115 criterion 3)', () => {
  const base = { performanceId: 'p-1', guest: { name: 'Door Sale', email: 'door@example.invalid' }, expectedTotalPence: 900, tender: 'CARD' as const }

  test(`exactly ${DESK_SALE_LINE_QUANTITY_CAP} on one line is fine`, () => {
    const result = deskSaleForm.safeParse({ ...base, lines: [{ ticketTypeId: 'tt-1', quantity: DESK_SALE_LINE_QUANTITY_CAP }] })
    expect(result.success).toBe(true)
  })

  test('one over the line cap is refused', () => {
    const result = deskSaleForm.safeParse({ ...base, lines: [{ ticketTypeId: 'tt-1', quantity: DESK_SALE_LINE_QUANTITY_CAP + 1 }] })
    expect(result.success).toBe(false)
  })

  test('many lines each at the cap are fine: nothing caps the order total', () => {
    const lines = Array.from({ length: 10 }, (_, index) => ({ ticketTypeId: `tt-${index}`, quantity: DESK_SALE_LINE_QUANTITY_CAP }))
    expect(deskSaleForm.safeParse({ ...base, lines }).success).toBe(true)
  })

  test('COMP is not a walk-up tender: D-117 names an existing reservation this write has not made yet', () => {
    const result = deskSaleForm.safeParse({ ...base, lines: [{ ticketTypeId: 'tt-1', quantity: 1 }], tender: 'COMP' })
    expect(result.success).toBe(false)
  })

  test('a name and an email are required, the same as a guest booking online', () => {
    const result = deskSaleForm.safeParse({ ...base, lines: [{ ticketTypeId: 'tt-1', quantity: 1 }], guest: undefined })
    expect(result.success).toBe(false)
  })
})

describe('a scanned code resolves to a token or a reference, whichever way it arrived (criterion 8)', () => {
  const BASE = 'https://newtheatre.org.uk'
  const TOKEN = 'r-abc123.sIgNaTuRe_-09'

  test('the booking URL this build issues is a signed token for the route to verify', () => {
    expect(readDeskScan(`${BASE}/qr/${TOKEN}`)).toEqual({ kind: 'BOOKING_TOKEN', value: TOKEN })
  })

  test('the bare token a hardware scanner types is the same token', () => {
    expect(readDeskScan(TOKEN)).toEqual({ kind: 'BOOKING_TOKEN', value: TOKEN })
  })

  test('the /t/<ref> form the show-night design names is a reference', () => {
    expect(readDeskScan(`${BASE}/t/k7m4pq`)).toEqual({ kind: 'REFERENCE', value: 'K7M4PQ' })
  })

  test('a bare reference is a reference, whatever its case', () => {
    expect(readDeskScan('k7m4pq')).toEqual({ kind: 'REFERENCE', value: 'K7M4PQ' })
  })

  test('a pass is refused with the door named: the desk collects bookings', () => {
    expect(readDeskScan(`${BASE}/passes/${TOKEN}`)).toEqual({ kind: 'REFUSED', reason: DESK_SCAN_PASS_REFUSAL })
    expect(DESK_SCAN_PASS_REFUSAL).toContain('door')
  })

  test('a URL that is none of ours is refused as such, not looked up as a booking', () => {
    expect(readDeskScan('https://example.com/somewhere-else')).toEqual({ kind: 'REFUSED', reason: DESK_SCAN_UNKNOWN_REFUSAL })
  })

  test('surrounding whitespace, which a scanner often appends, is ignored', () => {
    expect(readDeskScan(`  ${BASE}/qr/${TOKEN}
`)).toEqual({ kind: 'BOOKING_TOKEN', value: TOKEN })
  })
})

// K-128, issue 1151 item 8: a status the switch does not name still reads as words rather than as
// the value lowercased, which is how NO_SHOW reached the desk as "no_show".
describe('a booking status never reaches the desk as its stored value', () => {
  test('no reason carries the stored value', () => {
    for (const status of RESERVATION_STATUSES) {
      for (const said of [uncollectableReason(status), reinstateRefusal(status, null)]) {
        if (said === null) continue
        expect(said).not.toContain('_')
        expect(said).not.toContain(status)
      }
    }
  })

  test('a status nobody named reads as its wording', () => {
    expect(uncollectableReason('NO_SHOW')).toContain('no-show')
    expect(reinstateRefusal('NO_SHOW', null)).toContain('No-show')
  })
})

// Issue 1151 item 9, D-114 criterion 9. The night ran as its stored label with a "Today" button
// beside it, which is a calendar day and not the 04:00-to-04:00 night the desk actually works to.
describe('the desk names the night it is showing, not the label it stores it under', () => {
  const EVENING = new Date('2026-10-14T20:00:00Z')
  const AFTER_MIDNIGHT = new Date('2026-10-15T01:00:00Z')

  test('the night in progress is named as tonight, with its day beside it', () => {
    expect(saysDeskNight('2026-10-14', EVENING)).toBe('Tonight, Wed 14 Oct')
  })

  test('at one in the morning the night is still the evening it began', () => {
    expect(saysDeskNight('2026-10-14', AFTER_MIDNIGHT)).toBe('Tonight, Wed 14 Oct')
    expect(saysDeskNight('2026-10-15', AFTER_MIDNIGHT)).toBe('Thu 15 Oct')
  })

  test('any other night is its day alone', () => {
    expect(saysDeskNight('2026-10-15', EVENING)).toBe('Thu 15 Oct')
    expect(saysDeskNight('2026-10-13', EVENING)).toBe('Tue 13 Oct')
  })

  test('no night reaches the screen as the label it is stored under', () => {
    for (const night of ['2026-10-13', '2026-10-14', '2026-10-15']) {
      expect(saysDeskNight(night, EVENING)).not.toContain(night)
    }
  })
})

// D-115 criterion 7: the sum the officer reads into the reader, and what the screen sends as its
// expected total, are one computation (0004, 0005).
describe('a walk-up totals the lines it holds', () => {
  test('nothing chosen is nothing due', () => {
    expect(walkUpTotalPence([])).toBe(0)
  })

  test('a quantity multiplies its own price', () => {
    expect(walkUpTotalPence([{ pricePence: 650, quantity: 3 }])).toBe(1950)
  })

  test('lines of different ticket types add up', () => {
    expect(walkUpTotalPence([{ pricePence: 650, quantity: 2 }, { pricePence: 450, quantity: 1 }])).toBe(1750)
  })

  test('a line with no quantity contributes nothing, so a cleared field is not a free ticket', () => {
    expect(walkUpTotalPence([{ pricePence: 650, quantity: 0 }, { pricePence: 450, quantity: 2 }])).toBe(900)
  })
})

describe('a walk-up says what it still needs before any money moves', () => {
  const GUEST = { name: 'Ada Kowalski', email: 'ada@example.com' }
  const LINE = [{ pricePence: 650, quantity: 1 }]

  test('with nothing chosen it asks for a ticket', () => {
    expect(walkUpRefusal([], GUEST)).toContain('ticket')
  })

  test('with no name it asks for the booker', () => {
    expect(walkUpRefusal(LINE, { name: '  ', email: 'ada@example.com' })).toContain('name')
  })

  test('with no email it asks for that', () => {
    expect(walkUpRefusal(LINE, { name: 'Ada Kowalski', email: '' })).toContain('email')
  })

  test('a sale that is ready has nothing to say', () => {
    expect(walkUpRefusal(LINE, GUEST)).toBeNull()
  })

  test('nothing it says explains itself or names the machine', () => {
    const said = [walkUpRefusal([], GUEST), walkUpRefusal(LINE, { name: '', email: '' })]
    for (const says of said) {
      expect(says).not.toMatch(/\b(because|so that|reservation|row|write)\b/i)
      expect(says?.endsWith('.')).toBe(true)
    }
  })
})

// The results card searches on its own the moment a performance is chosen, so "No results yet"
// was shown for a search that had already run and matched nothing.
describe('the results card tells a search that has not run from one that matched nothing', () => {
  test('before anything has run it says what to do', () => {
    expect(deskEmptySays({ searched: false, narrowed: false })).toContain('Scan')
  })

  test('a narrowed search that matched nothing says so, and what to try', () => {
    const says = deskEmptySays({ searched: true, narrowed: true })
    expect(says).toContain('No booking matches')
    expect(says.toLowerCase()).toContain('name')
  })

  test('an unnarrowed search that matched nothing says the house has no bookings', () => {
    expect(deskEmptySays({ searched: true, narrowed: false })).toContain('No bookings on this performance')
  })

  test('the three read differently, and none of them is the old "no results yet"', () => {
    const said = [
      deskEmptySays({ searched: false, narrowed: false }),
      deskEmptySays({ searched: true, narrowed: false }),
      deskEmptySays({ searched: true, narrowed: true }),
    ]
    expect(new Set(said).size).toBe(3)
    for (const says of said) expect(says.toLowerCase()).not.toContain('no results')
  })
})

// D-114 criterion 9: Collect sat disabled on a comp with nothing beside it saying why.
describe('a comp the desk cannot collect says why', () => {
  const APPROVED = { status: 'APPROVED' as const, expired: false, declineReason: null }

  test('an approved, unexpired request blocks nothing', () => {
    expect(compBlockedSays(APPROVED)).toBeNull()
  })

  test('with no request at all it asks for one', () => {
    expect(compBlockedSays(null)).toContain('Ask')
  })

  test('a request still waiting names who decides it', () => {
    expect(compBlockedSays({ status: 'PENDING', expired: false, declineReason: null })).toContain('duty manager')
  })

  test('a declined request carries the reason it was declined with', () => {
    expect(compBlockedSays({ status: 'DECLINED', expired: false, declineReason: 'Sold out' })).toContain('Sold out')
  })

  test('a lapsed request says to ask again, whatever it was decided as', () => {
    expect(compBlockedSays({ status: 'APPROVED', expired: true, declineReason: null })).toContain('again')
    expect(compBlockedSays({ status: 'PENDING', expired: true, declineReason: null })).toContain('again')
  })

  test('each reason reads differently, so the button never points at the wrong one', () => {
    const said = [
      compBlockedSays(null),
      compBlockedSays({ status: 'PENDING', expired: false, declineReason: null }),
      compBlockedSays({ status: 'DECLINED', expired: false, declineReason: 'Sold out' }),
      compBlockedSays({ status: 'PENDING', expired: true, declineReason: null }),
    ]
    expect(new Set(said).size).toBe(said.length)
  })
})
