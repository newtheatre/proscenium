import { z } from 'zod'

// What a seat may be sold as. A type is global, its name is held once, and its base price is
// integer pence (D-119 criterion 1, 0004).

export const TICKET_TYPE_KINDS = ['SINGLE', 'PASS_ADMISSION'] as const
export const TICKET_TYPE_ACCESS_KINDS = ['ACCESS', 'COMPANION'] as const

export type TicketTypeKind = (typeof TICKET_TYPE_KINDS)[number]
export type TicketTypeAccessKind = (typeof TICKET_TYPE_ACCESS_KINDS)[number]

export const MAX_TICKET_TYPE_NAME = 80

// A house ticket is pounds, not thousands, so this is what catches pounds typed into a field
// that takes pence.
export const MAX_TICKET_PRICE_PENCE = 100_000

const pence = z.number().int().nonnegative().max(MAX_TICKET_PRICE_PENCE)

// Name, price and description are what an operator may change. Kind and access kind are what a
// sold ticket was sold under, so they are set once (D-119 criterion 2).
export const ticketTypeForm = z.object({
  // A rename is audited with both names, and audit detail refuses anything address-shaped (0011).
  name: z.string().trim().min(1, 'A ticket type needs a name').max(MAX_TICKET_TYPE_NAME)
    .refine(value => !value.includes('@'), 'A ticket type name is a label, so it holds no address'),
  description: z.string().trim().max(500).nullish(),
  price: pence,
  activeByDefault: z.boolean().default(true),
})

export const newTicketTypeForm = ticketTypeForm.extend({
  kind: z.enum(TICKET_TYPE_KINDS).default('SINGLE'),
  accessKind: z.enum(TICKET_TYPE_ACCESS_KINDS).nullish(),
})

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
  archived: boolean
  activeByDefault: boolean
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

export function saysTicketTypeKind(kind: string): string {
  return kind === 'PASS_ADMISSION' ? 'Pass admission' : 'Single ticket'
}

export function saysAccessKind(accessKind: string | null): string | null {
  if (accessKind === 'ACCESS') return 'Access'
  if (accessKind === 'COMPANION') return 'Companion'
  return null
}

// Pence in, pounds out, formatted the one way every screen shows money (0004).
export function saysPrice(price: number): string {
  return `£${(price / 100).toFixed(2)}`
}

// Which level of the chain answered, which is what `tickets.price_source` records (D-120).
export const PRICE_SOURCES = ['PERFORMANCE', 'SHOW', 'BASE'] as const

export type PriceSource = (typeof PRICE_SOURCES)[number]

export interface PriceOverride {
  price: number | null
  active: boolean | null
}

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
