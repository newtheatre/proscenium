import { describe, expect, test } from 'bun:test'
import { render, unwrapPlainText } from '#server/utils/templates'
import { HOUSE_ERROR, registerHouseErrors } from '#shared/utils/house-errors'
import { isNoSuchMessage, saysNoSuch } from '#shared/utils/no-such'
import { SAYS_PAYMENT, saysHowToPay, saysLatecomers } from '#shared/utils/programme'
import {
  belowMinimumTicketsReason,
  exchangeTotalPence,
  qrStatusDisplay,
  qrStatusTone,
  reservationEditForm,
  saysOrderCap,
  stepperMax,
} from '#shared/utils/reservations'
import { registerForm } from '#shared/utils/sign-in'
import { RESERVED_DOMAIN_REFUSAL } from '#shared/utils/deliverability'
import { waitingListJoinRefusal } from '#shared/utils/waiting-list'

// The public booking journey as the hands-on review of 13 October 2026 found it (D-104, D-108,
// D-110, D-111, D-113, decisions 0120 to 0122): each case is a finding the review named.

const PAGES = 'app/pages'
const source = (path: string): Promise<string> => Bun.file(path).text()

describe('the waiting list is for a party the house cannot seat (D-113 criterion 1, 0120)', () => {
  test('a performance with room for the whole party refuses the join and says to book', () => {
    expect(waitingListJoinRefusal(12, 2)).toContain('book')
    expect(waitingListJoinRefusal(2, 2)).not.toBeNull()
  })

  test('an uncapped house always has room, so nobody waits for it', () => {
    expect(waitingListJoinRefusal(null, 10)).not.toBeNull()
  })

  test('a full house, or one with fewer seats than the party, takes the join', () => {
    expect(waitingListJoinRefusal(0, 1)).toBeNull()
    expect(waitingListJoinRefusal(3, 4)).toBeNull()
  })

  test('the join page offers the booking first when seats are on sale', async () => {
    const page = await source(`${PAGES}/waiting-list/[performanceId].vue`)
    expect(page).toContain('data-test="waiting-list-on-sale"')
    expect(page).toContain('`/book/${performanceId}`')
  })

  test('the entry page offers to book once its party fits the seats on sale', async () => {
    const page = await source(`${PAGES}/waiting-list/entry/[token].vue`)
    expect(page).toContain('data-test="waiting-list-book"')
  })
})

describe('a refused address says what the page knows, not a generic 404 (K-128, 0121)', () => {
  test('a page\'s own no-such sentence is recognised and shown', () => {
    expect(isNoSuchMessage(saysNoSuch('performance', 'Go back to what is on and choose another'))).toBe(true)
    expect(isNoSuchMessage(saysNoSuch('waiting list entry', 'Ask for a new link from the email we sent you'))).toBe(true)
  })

  test('the router\'s own message for an unknown route is not, so it keeps the house words', () => {
    expect(isNoSuchMessage('Page not found: /nowhere')).toBe(false)
    expect(isNoSuchMessage(undefined)).toBe(false)
  })

  test('the error page uses it', async () => {
    expect(await source('app/error.vue')).toContain('isNoSuchMessage(')
  })
})

describe('the booking states read in their own colours (D-108 criterion 5)', () => {
  test('unpaid, paid, cancelled and exchanged are four tones, not one', () => {
    const tones = [
      qrStatusTone('PENDING', '£7.00', false),
      qrStatusTone('COLLECTED', null, false),
      qrStatusTone('CANCELLED', null, false),
      qrStatusTone('CANCELLED', null, true),
    ]
    expect(new Set(tones).size).toBe(4)
    expect(qrStatusTone('PENDING', '£7.00', false)).toBe('warning')
  })

  test('an exchanged booking names the booking that replaced it', () => {
    const display = qrStatusDisplay('CANCELLED', 'CUSTOMER', null, { showTitle: 'The Seagull', when: 'Tuesday 20 October 2026 at 19:30', reference: 'VXSXCE' })
    expect(display.detail).toContain('VXSXCE')
  })
})

describe('the order cap is shown before it is hit, and the steppers keep to it (D-104 criterion 2)', () => {
  test('a type may only rise as far as the order has room', () => {
    expect(stepperMax({ a: 4, b: 3 }, 'a', 10)).toBe(7)
    expect(stepperMax({ a: 10, b: 0 }, 'b', 10)).toBe(0)
    expect(stepperMax({ a: 0 }, 'a', 10, 1)).toBe(1)
  })

  test('the rule is said up front, with how many are left', () => {
    expect(saysOrderCap(10, 0)).toContain('10 tickets')
    expect(saysOrderCap(10, 7)).toContain('3 more')
    expect(saysOrderCap(10, 10)).toContain('box office')
  })

  test('the booking form takes its steppers from it', async () => {
    const page = await source(`${PAGES}/book/[performanceId].vue`)
    expect(page).toContain('stepperMax(')
    expect(page).toContain('data-test="booking-cap-rule"')
  })
})

describe('changing a booking to no tickets points at cancelling (D-110 criteria 2, 6)', () => {
  test('the write path says the same sentence the screen does', () => {
    const parsed = reservationEditForm.safeParse({ lines: [], reference: 'ABCDEF' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toBe(belowMinimumTicketsReason(0) ?? '')
  })

  test('the screen keeps a running total and offers Cancel booking at zero', async () => {
    const page = await source(`${PAGES}/qr/index.vue`)
    expect(page).toContain('data-test="booking-edit-total"')
    expect(page).toContain('data-test="booking-edit-zero"')
  })
})

describe('an exchange shows its new total before it is confirmed (D-111 criterion 2)', () => {
  const lines = [{ ticketTypeId: 'std', quantity: 2 }, { ticketTypeId: 'con', quantity: 1 }]

  test('the total is the booking\'s lines at the other night\'s prices', () => {
    expect(exchangeTotalPence(lines, [{ id: 'std', price: 700 }, { id: 'con', price: 500 }])).toBe(1900)
  })

  test('a night that does not offer one of the types has no total to quote', () => {
    expect(exchangeTotalPence(lines, [{ id: 'std', price: 700 }])).toBeNull()
  })

  test('the form quotes it and says the reference changes', async () => {
    const page = await source(`${PAGES}/qr/index.vue`)
    expect(page).toContain('data-test="booking-exchange-total"')
    expect(page).toContain('new reference')
  })
})

describe('the confirmation carries what somebody needs to arrive (D-106 criterion 1, D-108, 0122)', () => {
  const context = {
    name: 'Ada',
    reference: 'K7M4PQ',
    show: 'The Tempest',
    when: 'Friday 2 October 2026 at 19:30',
    totalDue: '£19.00',
    url: 'https://newtheatre.org.uk/qr/r-1.sig',
    imageUrl: 'https://newtheatre.org.uk/qr/r-1.sig/image.png',
    qrWidth: 165,
    guidance: [],
    showUrl: null,
    venue: 'The Portland Studio',
    venueAddress: 'University Park, Nottingham',
    doors: '19:00',
    releasesAt: '19:10',
    lines: [{ name: 'Standard', quantity: 2, total: '£14.00' }, { name: 'Concession', quantity: 1, total: '£5.00' }],
  }

  test('venue, address, doors, the release rule and each line\'s price', () => {
    const { html, text } = render('reservation-confirmed', context)
    for (const part of [html, text]) {
      expect(part).toContain('The Portland Studio')
      expect(part).toContain('University Park, Nottingham')
      expect(part).toContain('Doors open at 19:00')
      expect(part).toContain('released at 19:10')
      expect(part).toContain('Standard × 2')
      expect(part).toContain('£14.00')
    }
  })

  test('a changed booking says so in its subject and its first line', () => {
    const { subject, text } = render('reservation-confirmed', { ...context, change: 'CHANGED' })
    expect(subject).toBe('Your booking for The Tempest has changed')
    expect(text).toContain('now £19.00')
  })

  test('an exchange names the booking it replaces, which no longer admits anybody', () => {
    const { subject, text } = render('reservation-confirmed', { ...context, change: 'EXCHANGED', replaces: '4T8V6W' })
    expect(subject).toBe('Your booking for The Tempest has moved')
    expect(text).toContain('replaces booking 4T8V6W')
    expect(text).toContain('new reference K7M4PQ')
  })

  test('the cancellation links straight back to the show and to what is on', () => {
    const { html, text } = render('reservation-cancelled', {
      name: 'Ada',
      reference: 'K7M4PQ',
      show: 'The Tempest',
      when: 'Friday 2 October 2026 at 19:30',
      showUrl: 'https://newtheatre.org.uk/shows/the-tempest',
      whatsOnUrl: 'https://newtheatre.org.uk/whats-on',
    })
    expect(html).toContain('href="https://newtheatre.org.uk/shows/the-tempest"')
    expect(text).toContain('https://newtheatre.org.uk/whats-on')
  })

  test('the change-tickets route sends it', async () => {
    expect(await source('server/api/qr/tickets.put.ts')).toContain('sendReservationConfirmation(')
  })
})

describe('the plain-text part reads as sentences, not as the source\'s line breaks', () => {
  test('a line broken mid-sentence is joined back up', () => {
    expect(unwrapPlainText('Nothing was\ncharged: the booking was still unpaid.')).toBe('Nothing was charged: the booking was still unpaid.')
  })

  test('paragraphs, lists, links and a greeting keep their breaks', () => {
    const kept = 'Hello Ada,\n\nLapsed recently:\n- one\n- two\n\nOpen it: https://example.org/a\nthen come back'
    expect(unwrapPlainText(kept)).toBe(kept)
  })

  test('every rendered template\'s text comes out unwrapped', () => {
    const { text } = render('reservation-cancelled', {
      name: 'Ada',
      reference: 'K7M4PQ',
      show: 'The Tempest',
      when: 'Friday 2 October 2026 at 19:30',
    })
    expect(text).toContain('Nothing was charged')
  })
})

describe('a show sold by somebody else says so (D-122)', () => {
  test('every night external: the venue\'s box office, not ours', () => {
    expect(saysHowToPay([{ externalBookingUrl: 'https://elsewhere.example/', cancelled: false }])).not.toBe(SAYS_PAYMENT)
  })

  test('any night we sell keeps the house rule', () => {
    expect(saysHowToPay([{ externalBookingUrl: null, cancelled: false }, { externalBookingUrl: 'https://elsewhere.example/', cancelled: false }])).toBe(SAYS_PAYMENT)
  })

  test('the show page\'s main button links out when the only way to book is elsewhere', async () => {
    const page = await source(`${PAGES}/shows/[slug].vue`)
    expect(page).toContain('data-test="show-book-elsewhere"')
    expect(page).toContain('saysHowToPay(')
  })
})

describe('the show page\'s practical line reads as a sentence (D-102 criterion 3)', () => {
  test('an unset latecomer rule says what is unset', () => {
    expect(saysLatecomers(null)).toBe('Latecomer policy to be confirmed')
    expect(saysLatecomers('ADMITTED')).toBe('Latecomers admitted')
  })
})

describe('the account pages', () => {
  test('/reset checks its link before asking for a password', async () => {
    const page = await source(`${PAGES}/reset.vue`)
    expect(page).toContain('/api/auth/password/check')
  })

  test('/register says what each empty field needs, and a bad address is called that', async () => {
    registerHouseErrors()
    const empty = registerForm.safeParse({}).error?.issues.map(issue => issue.message)
    expect(empty).toEqual(['Enter your name', 'Enter your email address', 'Choose a password'])
    const malformed = registerForm.safeParse({ name: 'QA', email: 'qa.reg1@', password: 'x' }).error?.issues.map(issue => issue.message)
    expect(malformed).toEqual([HOUSE_ERROR.email])
    expect(await source(`${PAGES}/register.vue`)).toContain('registerForm')
  })

  // The 21 Oct process map: a .test address was told to check its email, and nothing ever came.
  test('/register refuses an address on a reserved domain rather than waiting on an email that never comes', () => {
    registerHouseErrors()
    const reserved = registerForm.safeParse({ name: 'QA', email: 'mon.skip@nnt-trial.test', password: 'x' }).error?.issues.map(issue => issue.message)
    expect(reserved).toEqual([RESERVED_DOMAIN_REFUSAL])
    expect(registerForm.safeParse({ name: 'QA', email: 'mon@nnt-trial.co.uk', password: 'x' }).success).toBe(true)
  })

  test('/verify never shows a validator\'s words, and a used link is not called expired', async () => {
    const route = await source('server/api/auth/verify/index.post.ts')
    expect(route).toContain('That link is incomplete')
    const page = await source(`${PAGES}/verify.vue`)
    expect(page).not.toContain('That link has expired\n')
    expect(page).toContain('already confirmed')
  })
})
