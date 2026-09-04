import { z } from 'zod'
import { CIVIL_DAY, SLUG } from './programme'

// A pass product: validity window, sales window, price points and covered shows, configured
// rather than issued from a spreadsheet (D-123). Issuing one is D-124's `passes` table.

export const PASS_TYPE_STATUSES = ['DRAFT', 'ON_SALE', 'CLOSED'] as const
export type PassTypeStatus = (typeof PASS_TYPE_STATUSES)[number]

export const MAX_PASS_TYPE_NAME = 120
export const MAX_PASS_TYPE_SLUG = 120
export const MAX_PRICE_LABEL = 80
export const MAX_PASS_PRICE_PENCE = 100_000

const pence = z.number().int().nonnegative().max(MAX_PASS_PRICE_PENCE)

export const passTypePriceForm = z.strictObject({
  label: z.string().trim().min(1, 'A price point needs a label').max(MAX_PRICE_LABEL),
  price: pence,
})

export type PassTypePriceInput = z.output<typeof passTypePriceForm>

// Name, description, windows and price points are what an operator may change here. Covered
// shows move through their own endpoint, because removing one is sometimes manager-gated (D-123).
const passTypeFields = {
  name: z.string().trim().min(1, 'A pass needs a name').max(MAX_PASS_TYPE_NAME),
  slug: z.string().trim().min(1, 'A pass needs an address').max(MAX_PASS_TYPE_SLUG)
    .regex(SLUG, 'Lowercase words joined by hyphens'),
  description: z.string().trim().max(2000).nullish(),
  validFrom: z.number().int().positive(),
  validUntil: z.number().int().positive(),
  salesOpenAt: z.number().int().positive().nullish(),
  salesCloseAt: z.number().int().positive().nullish(),
  // Null is uncapped: the blunt guard against selling 200 passes into an 86-seat house is an
  // explicit number, never assumed (D-123 criterion 2).
  maxIssued: z.number().int().positive().nullish(),
  prices: z.array(passTypePriceForm).min(1, 'A pass needs at least one price point')
    .refine(
      given => new Set(given.map(one => one.label.trim().toLowerCase())).size === given.length,
      'Each price point needs its own label',
    ),
}

const validWindow = (input: { validFrom: number, validUntil: number }): boolean => input.validUntil >= input.validFrom
const salesWindow = (input: { salesOpenAt?: number | null, salesCloseAt?: number | null }): boolean =>
  input.salesCloseAt == null || input.salesOpenAt == null || input.salesCloseAt >= input.salesOpenAt

// Born DRAFT like a show or a performance, whatever the request asks: it goes on sale by its own
// action, never by being created.
const showIdsField = z.array(z.string().trim().min(1)).min(1, 'A pass needs to cover at least one show')
  .refine(given => new Set(given).size === given.length, 'A show is covered once')

export const newPassTypeForm = z.object({ ...passTypeFields, showIds: showIdsField }).strict()
  .refine(validWindow, { message: 'A pass cannot expire before it starts', path: ['validUntil'] })
  .refine(salesWindow, { message: 'Sales cannot close before they open', path: ['salesCloseAt'] })

export type NewPassTypeInput = z.output<typeof newPassTypeForm>

// Status moves here too: there is no cascading side effect to a pass going on or off sale, unlike
// a show's publish flow, so it is an ordinary field rather than its own action.
export const passTypeForm = z.object({ ...passTypeFields, status: z.enum(PASS_TYPE_STATUSES) }).strict()
  .refine(validWindow, { message: 'A pass cannot expire before it starts', path: ['validUntil'] })
  .refine(salesWindow, { message: 'Sales cannot close before they open', path: ['salesCloseAt'] })

export type PassTypeInput = z.output<typeof passTypeForm>

// The full set a product covers, replaced in one action like a price override chain: additions
// are always fine, and a removal is checked against live passes (D-123 criterion 4).
export const passTypeShowsForm = z.strictObject({ showIds: showIdsField })

export type PassTypeShowsInput = z.output<typeof passTypeShowsForm>

const screenDay = (message: string) => z.string().regex(CIVIL_DAY, message)
const screenWindow = (message: string) => z.union([z.literal(''), z.string().regex(CIVIL_DAY, message)])

// What the screen holds: London days as plain strings, turned into instants before they are sent.
// Validating the request shape against this state would fail on every date field (0014).
const passTypeScreenFields = {
  name: passTypeFields.name,
  slug: passTypeFields.slug,
  description: z.string().trim().max(2000),
  validFrom: screenDay('A pass needs a start date'),
  validUntil: screenDay('A pass needs an end date'),
  salesOpenAt: screenWindow('That is not a date'),
  salesCloseAt: screenWindow('That is not a date'),
  maxIssued: z.number().int().positive().nullish(),
}

export const newPassTypeScreenForm = z.object({ ...passTypeScreenFields, showIds: showIdsField })
export const passTypeScreenForm = z.object({ ...passTypeScreenFields, status: z.enum(PASS_TYPE_STATUSES) })

export interface PassTypePrice {
  id: string
  label: string
  price: number
}

// What the console reads. `everIssued` is a query over the tables that reference it, never a
// column, so it cannot drift from the rows it describes (D-123 criterion 3).
export interface PassType {
  id: string
  slug: string
  name: string
  description: string | null
  status: PassTypeStatus
  validFrom: number
  validUntil: number
  salesOpenAt: number | null
  salesCloseAt: number | null
  maxIssued: number | null
  everIssued: boolean
  prices: PassTypePrice[]
  showIds: string[]
}

export function saysPassTypeStatus(status: string): string {
  if (status === 'ON_SALE') return 'On sale'
  if (status === 'CLOSED') return 'Closed'
  return 'Draft'
}
