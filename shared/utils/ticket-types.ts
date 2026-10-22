import { z } from 'zod'

// What a seat may be sold as. A type is global, its name is held once, and its base price is
// integer pence (D-119 criterion 1, 0004).

// The data vocabulary, not an officer's choice: every type an officer creates is SINGLE, and the
// one PASS_ADMISSION row is the system's own, minted on first redemption or by the import (0074).
export const TICKET_TYPE_KINDS = ['SINGLE', 'PASS_ADMISSION'] as const
export const PASS_ADMISSION_TICKET_TYPE_NAME = 'Pass admission'
export const TICKET_TYPE_ACCESS_KINDS = ['ACCESS', 'COMPANION'] as const
// Concession is not a value: it has no agreed eligibility evidence yet (D-109). DESK keeps a type
// off every customer channel, such as a comp the house gives away (0190).
export const TICKET_TYPE_RESTRICTIONS = ['MEMBER', 'DESK'] as const

export type TicketTypeKind = (typeof TICKET_TYPE_KINDS)[number]
export type TicketTypeAccessKind = (typeof TICKET_TYPE_ACCESS_KINDS)[number]
export type TicketTypeRestriction = (typeof TICKET_TYPE_RESTRICTIONS)[number]

export const MAX_TICKET_TYPE_NAME = 80

// A house ticket is pounds, not thousands, so this is what catches pounds typed into a field
// that takes pence.
export const MAX_TICKET_PRICE_PENCE = 100_000

// Each refusal says what to type: a field never turns -5 into nought or 7.555 into £7.55 (0125).
const pence = z.number({ error: 'Type a price in pounds and pence, such as 7.50' })
  .int('Type a price in pounds and pence, such as 7.50')
  .nonnegative('A price cannot be below nought')
  .max(MAX_TICKET_PRICE_PENCE, 'A ticket costs at most £1,000.00')

// Name, price and description are what an operator may change. Access kind is what a sold ticket
// was sold under, so it is set once (D-119 criterion 2). Kind is not asked: every made type is SINGLE (0074).
export const ticketTypeForm = z.object({
  // A rename is audited with both names, and audit detail refuses anything address-shaped (0011).
  name: z.string().trim().min(1, 'A ticket type needs a name').max(MAX_TICKET_TYPE_NAME)
    .refine(value => !value.includes('@'), 'A ticket type name is a label, so it holds no address'),
  description: z.string().trim().max(500).nullish(),
  price: pence,
  activeByDefault: z.boolean().default(true),
  sort: z.number().int('An order is a whole number').nonnegative('An order is nought or more').default(0),
})

export const newTicketTypeForm = ticketTypeForm.extend({
  accessKind: z.enum(TICKET_TYPE_ACCESS_KINDS).nullish(),
  restrictedTo: z.enum(TICKET_TYPE_RESTRICTIONS).nullish(),
}).refine(
  input => input.accessKind !== 'COMPANION' || input.price === 0,
  { message: 'A companion ticket is always free', path: ['price'] },
)

// Members-only is fixed at creation (D-109); open and box office only swap either way (0190).
// An edit that leaves the order out keeps it, so an older form never resets it to nought (0193).
export const editTicketTypeForm = ticketTypeForm.extend({
  restrictedTo: z.enum(TICKET_TYPE_RESTRICTIONS).nullable().optional(),
  sort: z.number().int('An order is a whole number').nonnegative('An order is nought or more').optional(),
})

export function restrictionChangeRefusal(held: TicketTypeRestriction | null, wanted: TicketTypeRestriction | null): string | null {
  if (held === wanted || (held !== 'MEMBER' && wanted !== 'MEMBER')) return null
  return 'Who may book a members-only type is set when it is added, and not changed afterwards'
}

export const archiveTicketTypeForm = z.object({
  archived: z.boolean(),
})

export type TicketTypeInput = z.output<typeof ticketTypeForm>
export type NewTicketTypeInput = z.output<typeof newTicketTypeForm>

// Everything a type carries, which is what the console reads. No public payload is built from
// this shape.
export interface TicketType {
  id: string
  name: string
  description: string | null
  price: number
  kind: TicketTypeKind
  accessKind: TicketTypeAccessKind | null
  restrictedTo: TicketTypeRestriction | null
  archived: boolean
  activeByDefault: boolean
  sort: number
  everSold: boolean
}

// The columns a visitor may see. Anything absent here is absent from every public payload,
// which is what an allow-list buys over a deny-list (CONTRIBUTING).
export interface PublicTicketType {
  id: string
  name: string
  description: string | null
  price: number
}

export function isPublicTicketType(type: Pick<TicketType, 'archived' | 'accessKind'>): boolean {
  return !type.archived && type.accessKind === null
}

// Nobody but an entitled booker sees an access or companion type, and their entitled payload is
// D-128's own resolution rather than a widening of this one (D-119 criterion 4).
export function publicTicketTypes(types: TicketType[]): PublicTicketType[] {
  return types.filter(isPublicTicketType).map(type => ({
    id: type.id,
    name: type.name,
    description: type.description,
    price: type.price,
  }))
}

export function isSystemTicketType(type: Pick<TicketType, 'kind'>): boolean {
  return type.kind === 'PASS_ADMISSION'
}

// The one sentence every write route quotes when asked to touch the system's own row (0074): the
// same shape a reserved pass type's refusal takes, and a 409 rather than a 404, since the row exists.
export function systemTicketTypeRefusal(type: Pick<TicketType, 'kind' | 'name'>): string | null {
  if (!isSystemTicketType(type)) return null
  return `${type.name} is the system's own ticket type: a pass holder is seated under it automatically, so it cannot be edited, archived or deleted`
}

export function saysAccessKind(accessKind: string | null): string | null {
  if (accessKind === 'ACCESS') return 'Access'
  if (accessKind === 'COMPANION') return 'Companion'
  return null
}

// The warning when verifying an access profile would entitle its holder to nothing (or to no
// companion): null once both kinds have a ticket type on offer.
export function saysAccessKindsMissing(kinds: { access: boolean, companion: boolean }): string | null {
  const missing = [kinds.access ? null : 'Access', kinds.companion ? null : 'Companion'].filter(Boolean)
  if (missing.length === 0) return null
  return `There is no ${missing.join(' or ')} ticket type, so a verified access profile cannot book one. Add it under Ticket types, choosing it in Access or companion.`
}

export const SAYS_ANYONE = 'Anyone'

export function saysRestriction(restrictedTo: string | null): string | null {
  if (restrictedTo === 'MEMBER') return 'Current members only'
  if (restrictedTo === 'DESK') return 'Box office only'
  return null
}

// "From" is the cheapest seat anybody may book; a cheaper members' price is said apart, never as
// the floor a guest is then refused (D-109).
export function saysFromPrice(prices: { price: number, restrictedTo: string | null }[]): string | null {
  const open = prices.filter(one => one.restrictedTo === null).map(one => one.price)
  const members = prices.filter(one => one.restrictedTo === 'MEMBER').map(one => one.price)
  const floor = open.length ? Math.min(...open) : null
  const memberFloor = members.length ? Math.min(...members) : null
  if (floor === null) return memberFloor === null ? null : `Members from ${saysPrice(memberFloor)}`
  if (memberFloor === null || memberFloor >= floor) return `From ${saysPrice(floor)}`
  return `From ${saysPrice(floor)}, members ${saysPrice(memberFloor)}`
}

// Pence in, pounds out, unprefixed: the figure a machine reads, such as a schema.org offer.
export const pounds = (pence: number): string => (pence / 100).toFixed(2)

// Pence in, pounds out, formatted the one way every screen shows money (0004).
export function saysPrice(price: number): string {
  return `£${pounds(price)}`
}

// Which level of the chain answered. The story's vocabulary is base, show and performance, which
// is what an operator is shown beside a price (D-120 criterion 2).
export const PRICE_SOURCES = ['PERFORMANCE', 'SHOW', 'BASE'] as const

// What `tickets.price_source` stores: the three above, plus the one a resolution can never
// produce, because a migrated ticket's price was resolved by the old estate (D-120 criterion 3).
export const TICKET_PRICE_SOURCES = [...PRICE_SOURCES, 'IMPORT'] as const

export type PriceSource = (typeof PRICE_SOURCES)[number]
export type TicketPriceSource = (typeof TICKET_PRICE_SOURCES)[number]

export function saysPriceSource(source: string): string {
  if (source === 'PERFORMANCE') return 'This performance'
  if (source === 'SHOW') return 'This show'
  if (source === 'IMPORT') return 'Imported'
  return 'The ticket type'
}

export interface PriceOverride {
  price: number | null
  active: boolean | null
}

// What one level of the chain sets. Null at either field means inherit, so clearing an override is
// sending null rather than deleting a row by hand (D-120 criterion 1).
export const priceOverridesForm = z.object({
  overrides: z.array(z.strictObject({
    ticketTypeId: z.string().trim().min(1, 'Say which ticket type you mean'),
    price: pence.nullable(),
    active: z.boolean().nullable(),
  })).max(100)
    .refine(
      given => new Set(given.map(one => one.ticketTypeId)).size === given.length,
      'A level prices a ticket type once',
    ),
}).strict()

export type PriceOverridesInput = z.output<typeof priceOverridesForm>

export interface ResolvedPrice {
  price: number
  source: PriceSource
  active: boolean
}

// Performance, then show, then the type itself, resolving each field on its own: null means
// inherit and an explicit nought is a free ticket, never an absence (D-120 criterion 1).
export function resolvePrice(
  type: { price: number, activeByDefault: boolean },
  show: PriceOverride | null,
  performance: PriceOverride | null,
): ResolvedPrice {
  const price = performance?.price ?? show?.price ?? type.price
  const source: PriceSource = performance?.price != null ? 'PERFORMANCE' : show?.price != null ? 'SHOW' : 'BASE'
  return { price, source, active: performance?.active ?? show?.active ?? type.activeByDefault }
}
