import { describe, expect, test } from 'bun:test'
import {
  MAX_TICKET_PRICE_PENCE,
  archiveTicketTypeForm,
  isPublicTicketType,
  newTicketTypeForm,
  publicTicketTypes,
  saysAccessKind,
  saysPrice,
  saysTicketTypeKind,
  ticketTypeForm,
} from '#shared/utils/ticket-types'
import type { TicketType } from '#shared/utils/ticket-types'

// D-119's vocabulary: what a ticket type may be called, what it may cost, and what a visitor is
// ever shown of one.

function type(over: Partial<TicketType> = {}): TicketType {
  return {
    id: 'tt-standard',
    name: 'Standard',
    description: 'The ordinary seat',
    price: 700,
    kind: 'SINGLE',
    accessKind: null,
    archived: false,
    activeByDefault: true,
    everSold: false,
    ...over,
  }
}

describe('a ticket type carries a base price in integer pence (criterion 1)', () => {
  test('a price in pence is taken', () => {
    expect(newTicketTypeForm.parse({ name: 'Standard', price: 700 }).price).toBe(700)
  })

  test('a price of nought is a price, and a negative one is not', () => {
    expect(newTicketTypeForm.safeParse({ name: 'Comp', price: 0 }).success).toBe(true)
    expect(newTicketTypeForm.safeParse({ name: 'Owed', price: -1 }).success).toBe(false)
  })

  // Pounds typed into a field that takes pence is the mistake this catches.
  test('a fractional price and an absurd one are both refused', () => {
    expect(newTicketTypeForm.safeParse({ name: 'Half', price: 7.5 }).success).toBe(false)
    expect(newTicketTypeForm.safeParse({ name: 'Wrong', price: MAX_TICKET_PRICE_PENCE + 1 }).success).toBe(false)
  })

  test('a type needs a name, and an address is not one', () => {
    expect(newTicketTypeForm.safeParse({ name: '   ', price: 700 }).success).toBe(false)
    expect(newTicketTypeForm.safeParse({ name: 'box@newtheatre.org.uk', price: 700 }).success).toBe(false)
  })

  test('the kind defaults to a single ticket and takes nothing invented', () => {
    expect(newTicketTypeForm.parse({ name: 'Standard', price: 700 }).kind).toBe('SINGLE')
    expect(newTicketTypeForm.safeParse({ name: 'Standard', price: 700, kind: 'SEASON' }).success).toBe(false)
  })
})

describe('kind and access kind are set once (criterion 2)', () => {
  // A sold ticket was sold under a kind, so an edit that could change it would rewrite history.
  test('the edit form takes neither', () => {
    const edited = ticketTypeForm.parse({ name: 'Standard', price: 800, kind: 'PASS_ADMISSION', accessKind: 'ACCESS' })
    expect('kind' in edited).toBe(false)
    expect('accessKind' in edited).toBe(false)
  })

  test('the archive form takes a state, not a wish', () => {
    expect(archiveTicketTypeForm.safeParse({}).success).toBe(false)
    expect(archiveTicketTypeForm.parse({ archived: true }).archived).toBe(true)
  })
})

describe('an access or companion type is never in a public payload (criterion 4)', () => {
  const types = [
    type(),
    type({ id: 'tt-member', name: 'Member', price: 500 }),
    type({ id: 'tt-access', name: 'Access', accessKind: 'ACCESS' }),
    type({ id: 'tt-companion', name: 'Companion', price: 0, accessKind: 'COMPANION' }),
    type({ id: 'tt-old', name: 'Retired', archived: true }),
  ]

  test('neither flagged type is offered, whatever else it looks like', () => {
    expect(publicTicketTypes(types).map(shown => shown.id)).toEqual(['tt-standard', 'tt-member'])
  })

  test('an archived type is not offered for a new sale either', () => {
    expect(isPublicTicketType({ archived: true, accessKind: null })).toBe(false)
    expect(isPublicTicketType({ archived: false, accessKind: 'ACCESS' })).toBe(false)
    expect(isPublicTicketType({ archived: false, accessKind: null })).toBe(true)
  })

  // An allow-list, so a column added to the table later is absent from the payload by default.
  test('a public payload carries four columns and no flag', () => {
    const [shown] = publicTicketTypes([type()])
    expect(Object.keys(shown!).sort()).toEqual(['description', 'id', 'name', 'price'])
  })

  test('nothing about the flag survives into the payload under another name', () => {
    const serialised = JSON.stringify(publicTicketTypes(types))
    for (const leak of ['accessKind', 'ACCESS', 'COMPANION', 'archived', 'activeByDefault', 'everSold']) {
      expect(`${leak}: ${serialised.includes(leak)}`).toBe(`${leak}: false`)
    }
  })
})

describe('what a screen says', () => {
  test('a kind reads as English', () => {
    expect(saysTicketTypeKind('SINGLE')).toBe('Single ticket')
    expect(saysTicketTypeKind('PASS_ADMISSION')).toBe('Pass admission')
  })

  test('an access kind reads as English, and an ordinary type has nothing to say', () => {
    expect(saysAccessKind('ACCESS')).toBe('Access')
    expect(saysAccessKind('COMPANION')).toBe('Companion')
    expect(saysAccessKind(null)).toBeNull()
  })

  test('pence format as pounds only at display', () => {
    expect(saysPrice(700)).toBe('£7.00')
    expect(saysPrice(0)).toBe('£0.00')
    expect(saysPrice(1250)).toBe('£12.50')
  })
})
