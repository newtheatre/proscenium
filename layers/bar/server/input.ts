// The shapes the bar's catalogue routes accept, shared so a create and an edit agree on every bound.
// Nothing here imports server code at run time: the set-up screens check their forms with these too.
import { z } from 'zod'
import type * as schema from './db/schema'

// The schema's fixed lists, repeated so a page can import this file; `satisfies` keeps them the same.
const OUTLET_KINDS = ['bar', 'kiosk', 'desk'] as const satisfies typeof schema.OUTLET_KINDS
const TILL_LAYOUTS = ['chips', 'folders', 'rail'] as const satisfies typeof schema.TILL_LAYOUTS
const CHOICE_SOURCES = ['options', 'mixers'] as const satisfies typeof schema.CHOICE_SOURCES
const MIXER_PRICING = ['included', 'fixed', 'own_price'] as const satisfies typeof schema.MIXER_PRICING

const name = z.string().trim().min(1).max(80) // not-policy: a name's bounds
const amount = z.number().int().min(0).max(1_000_000) // not-policy: a bound on a typed price
const id = z.string().min(1).max(64) // not-policy: an id's length
// A named colour token from the theme, never a hex value.
export const COLOURS = ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] as const

// A usual preset is a built-in key ('builtin:wine') or one of the theatre's preset ids.
const presetRef = z.string().min(1).max(64) // not-policy: an id's length
export const categoryInput = z.object({ name, colour: z.enum(COLOURS).nullable().optional(), parentId: id.nullable().optional(), ageRestricted: z.boolean().optional(), usualPreset: presetRef.nullable().optional() }).strict()
export const categoryPatch = categoryInput.partial().extend({ active: z.boolean().optional() }).strict()

export const productInput = z.object({
  categoryId: id,
  name,
  // null: as the category.
  ageRestricted: z.boolean().nullable().optional(),
  variantName: z.string().trim().max(80).optional(), // not-policy: a name's bound
  amountMinor: amount.nullable().optional(),
}).strict()
export const productPatch = z.object({ categoryId: id, name, ageRestricted: z.boolean().nullable(), active: z.boolean() }).partial().strict()

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

export const outletInput = z.object({ name, kind: z.enum(OUTLET_KINDS), priceListId: id.nullable().optional(), spaceId: id.nullable().optional(), stockLocationId: id.nullable().optional(), tillLayout: z.enum(TILL_LAYOUTS).optional() }).strict()
export const outletPatch = outletInput.partial().extend({ active: z.boolean().optional() }).strict()

// The sizes pinned to the front of an outlet's till, in order. Replaces the whole set.
export const favouritesInput = z.object({ variantIds: z.array(id).max(40) }).strict() // not-policy: a bound on one screen's buttons, inside a unit's statement cap

// ---- Choices -------------------------------------------------------------------------------------

const MAX_PICKS = 10 // not-policy: more picks than any drink needs
export const groupInput = z.object({
  name,
  source: z.enum(CHOICE_SOURCES),
  required: z.boolean().optional(),
  maxPicks: z.number().int().min(1).max(MAX_PICKS).optional(),
  mixerPricing: z.enum(MIXER_PRICING).nullable().optional(),
  mixerFixedMinor: amount.nullable().optional(),
  // The usual pick, chosen as the group is made: a mixer, since a list by hand has no options yet.
  defaultKey: id.nullable().optional(),
}).strict()
export const groupPatch = groupInput.omit({ source: true, defaultKey: true }).partial().extend({ defaultKey: id.nullable().optional(), active: z.boolean().optional() }).strict()
// The stock item a recipe's slot for this group takes when this option is picked; none for "No mixer".
export const optionInput = z.object({ name, deltaMinor: amount.optional(), ageRestricted: z.boolean().optional(), stockItemId: id.nullable().optional() }).strict()
export const optionPatch = optionInput.partial().extend({ active: z.boolean().optional() }).strict()
// A hand-listed group's options in their new order: every option in use, each once.
export const optionOrderInput = z.object({ optionIds: z.array(id).min(1).max(100) }).strict() // not-policy: more options than a till shows

// ---- Presets and Add a product -------------------------------------------------------------------

const MAX_SIZES = 8 // not-policy: more sizes than any drink has, inside a unit's statement cap
const MAX_GROUPS = 10 // not-policy: more choices than any drink asks
const sizeInput = z.object({ name, measure: z.string().trim().max(40).nullable().optional() }).strict() // not-policy: a measure's bound

/** Each size names itself once: a second "125ml" is refused on the row that repeats it. */
function uniqueSizes(sizes: { name: string }[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>()
  sizes.forEach((s, i) => {
    const key = s.name.trim().toLowerCase()
    if (key && seen.has(key)) ctx.addIssue({ code: 'custom', message: 'bar.screens.add-product.size-taken', path: ['sizes', i, 'name'] })
    seen.add(key)
  })
}

export const presetInput = z.object({
  name,
  sizes: z.array(sizeInput).min(1).max(MAX_SIZES),
  groupIds: z.array(id).max(MAX_GROUPS).default([]),
  ageRestricted: z.boolean().nullable().default(null),
  mixer: z.boolean().default(false),
}).strict().superRefine((v, ctx) => uniqueSizes(v.sizes, ctx))
export type PresetInput = z.infer<typeof presetInput>
export const presetPatch = z.object({ name, active: z.boolean() }).partial().strict()
export type PresetPatch = z.infer<typeof presetPatch>

/** What Add a product sends: the product, one row per size with its Standard price, and its choices. */
export const setupInput = z.object({
  categoryId: id,
  name,
  ageRestricted: z.boolean().nullable().default(null),
  sizes: z.array(z.object({ name, amountMinor: amount.nullable().optional() }).strict()).min(1).max(MAX_SIZES),
  groupIds: z.array(id).max(MAX_GROUPS).default([]),
  mixer: z.boolean().default(false),
}).strict().superRefine((v, ctx) => uniqueSizes(v.sizes, ctx))
export type SetupInput = z.infer<typeof setupInput>
