import { describe, expect, test } from 'bun:test'
import {
  MAX_TICKET_PRICE_PENCE,
  PASS_ADMISSION_TICKET_TYPE_NAME,
  archiveTicketTypeForm,
  isPublicTicketType,
  isSystemTicketType,
  newTicketTypeForm,
  publicTicketTypes,
  saysAccessKind,
  saysPrice,
  saysRestriction,
  systemTicketTypeRefusal,
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
    restrictedTo: null,
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

  // Kind is the data vocabulary, not an officer's choice (0074): a client still sending one is
  // neither refused nor obeyed, and the route writes SINGLE regardless.
  test('the creation form does not ask for a kind, and one sent is dropped rather than refused', () => {
    expect('kind' in newTicketTypeForm.parse({ name: 'Standard', price: 700 })).toBe(false)
    expect('kind' in newTicketTypeForm.parse({ name: 'Standard', price: 700, kind: 'SINGLE' })).toBe(false)
    expect('kind' in newTicketTypeForm.parse({ name: 'Standard', price: 700, kind: 'PASS_ADMISSION' })).toBe(false)
    expect(newTicketTypeForm.safeParse({ name: 'Standard', price: 700, kind: 'SEASON' }).success).toBe(true)
  })
})

describe('the pass-admission type is the system\'s own (0074)', () => {
  test('it is told apart by kind, never by name or id', () => {
    expect(isSystemTicketType({ kind: 'PASS_ADMISSION' })).toBe(true)
    expect(isSystemTicketType({ kind: 'SINGLE' })).toBe(false)
  })

  test('every write route quotes the same plain sentence, and an ordinary type has nothing to say', () => {
    const refusal = systemTicketTypeRefusal({ kind: 'PASS_ADMISSION', name: PASS_ADMISSION_TICKET_TYPE_NAME })
    expect(refusal).toBe('Pass admission is the system\'s own ticket type: a pass holder is seated under it automatically, so it cannot be edited, archived or deleted')
    expect(systemTicketTypeRefusal(type())).toBeNull()
  })

  test('the row goes by one name wherever it is written', () => {
    expect(PASS_ADMISSION_TICKET_TYPE_NAME).toBe('Pass admission')
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

describe('a companion ticket is always free (D-128 criterion 3)', () => {
  test('a companion type at any price above nought is refused', () => {
    expect(newTicketTypeForm.safeParse({ name: 'Companion', price: 1, accessKind: 'COMPANION' }).success).toBe(false)
  })

  test('a companion type priced at nought is accepted', () => {
    expect(newTicketTypeForm.safeParse({ name: 'Companion', price: 0, accessKind: 'COMPANION' }).success).toBe(true)
  })

  test('an access type carries no such restriction', () => {
    expect(newTicketTypeForm.safeParse({ name: 'Access', price: 700, accessKind: 'ACCESS' }).success).toBe(true)
  })

  test('an ordinary type carries no such restriction', () => {
    expect(newTicketTypeForm.safeParse({ name: 'Standard', price: 700 }).success).toBe(true)
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
  test('an access kind reads as English, and an ordinary type has nothing to say', () => {
    expect(saysAccessKind('ACCESS')).toBe('Access')
    expect(saysAccessKind('COMPANION')).toBe('Companion')
    expect(saysAccessKind(null)).toBeNull()
  })

  test('a restricted type names who; an open type has nothing to say (D-109 criterion 1)', () => {
    expect(saysRestriction('MEMBER')).toBe('Current members only')
    expect(saysRestriction(null)).toBeNull()
  })

  test('pence format as pounds only at display', () => {
    expect(saysPrice(700)).toBe('£7.00')
    expect(saysPrice(0)).toBe('£0.00')
    expect(saysPrice(1250)).toBe('£12.50')
  })
})

// D-119 criterion 6, issue 1151 item 10: the access kind and the online restriction are set at
// creation, and the edit form hid both, so an edit read as a type that had neither.
describe('a field settable only at creation is read-only on the edit form, never absent', () => {
  const SCREEN = 'app/pages/box-office/ticket-types.vue'
  const screen = (): Promise<string> => Bun.file(SCREEN).text()

  test('the edit form names the access kind the type was created with', async () => {
    expect(await screen()).toContain('ticket-type-access-fixed')
  })

  test('the edit form names who may book it online', async () => {
    expect(await screen()).toContain('ticket-type-restriction-fixed')
  })

  test('both read through the wording helpers rather than as the stored value', async () => {
    const source = await screen()
    expect(source).toContain('saysAccessKind')
    expect(source).toContain('saysRestriction')
  })
})
