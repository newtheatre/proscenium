// The shapes the bar's catalogue routes accept, shared so a create and an edit agree on every bound.
import { z } from 'zod'
import { OUTLET_KINDS } from './db/schema'

const name = z.string().trim().min(1).max(80) // not-policy: a name's bounds
const amount = z.number().int().min(0).max(1_000_000) // not-policy: a bound on a typed price
const id = z.string().min(1).max(64) // not-policy: an id's length
// A named colour token from the theme, never a hex value.
export const COLOURS = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const

export const categoryInput = z.object({ name, colour: z.enum(COLOURS).nullable().optional() }).strict()
export const categoryPatch = categoryInput.partial().extend({ active: z.boolean().optional() }).strict()

export const productInput = z.object({
  categoryId: id,
  name,
  ageRestricted: z.boolean().optional(),
  variantName: z.string().trim().max(80).optional(), // not-policy: a name's bound
  amountMinor: amount.nullable().optional(),
}).strict()
export const productPatch = z.object({ categoryId: id, name, ageRestricted: z.boolean(), active: z.boolean() }).partial().strict()

export const variantInput = z.object({ name, barcode: z.string().trim().min(1).max(64).nullable().optional(), amountMinor: amount.nullable().optional() }).strict() // not-policy: a barcode's bound
export const variantPatch = z.object({ name, barcode: z.string().trim().min(1).max(64).nullable(), active: z.boolean() }).partial().strict() // not-policy: a barcode's bound

export const priceInput = z.object({
  variantId: id,
  priceListId: id.nullable(),
  amountMinor: amount.nullable(),
  effectiveFrom: z.number().int().positive().optional(),
}).strict()

const percent = z.number().int().min(1).max(100) // not-policy: a percentage
export const priceListInput = z.object({ name, restricted: z.boolean().optional(), fallsBack: z.boolean().optional(), percentOff: percent.nullable().optional() }).strict()
export const priceListPatch = priceListInput.partial().extend({ active: z.boolean().optional() }).strict()

export const outletInput = z.object({ name, kind: z.enum(OUTLET_KINDS), priceListId: id.nullable().optional(), spaceId: id.nullable().optional() }).strict()
export const outletPatch = outletInput.partial().extend({ active: z.boolean().optional() }).strict()
