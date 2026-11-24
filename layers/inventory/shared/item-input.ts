// What an item says about itself, the same whether added or changed (spec part 2, inventory_items),
// shared so the form refuses what the server would. Bounds are shapes, as the table's CHECKs.
import { z } from 'zod'
import { CONDITIONS, OWNERSHIP, TRACKING } from './states'

const id = z.string().min(1).max(40) // not-policy: shape bound
const requirements = z.array(z.string().min(3).max(200)).max(10).default([]) // not-policy: shape bound

// Several alike makes this many individual items; a counted item is one row with a quantity (I1, I4).
const count = z.number().int().min(1).max(2000).default(1) // not-policy: core.units.set-rows-limit's own ceiling
const quantity = z.number().int().min(1).max(1_000_000) // not-policy: shape bound
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: the shape of YYYY-MM-DD
const text = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null)

const itemDetails = {
  name: z.string().trim().min(1).max(120), // not-policy: as the table's CHECK
  description: text(4000), // not-policy: as the table's CHECK
  homeLocationId: id,
  condition: z.enum(CONDITIONS),
  lendable: z.boolean(),
  make: text(80), // not-policy: as the table's CHECK
  model: text(80), // not-policy: as the table's CHECK
  serialNumber: text(80), // not-policy: as the table's CHECK
  acquiredOn: localDate.nullish().transform(v => v ?? null),
  replacementValue: z.number().int().min(0).nullish().transform(v => v ?? null),
  ownership: z.enum(OWNERSHIP),
  ownerName: text(120), // not-policy: as the table's CHECK
  ownerDueBackOn: localDate.nullish().transform(v => v ?? null),
  tagIds: z.array(id).max(20).default([]), // not-policy: shape bound
  requirements,
}

// I11: kit that is not the theatre's own names its owner and when it goes back.
const ownerNamed = (v: { ownership: string, ownerName: string | null, ownerDueBackOn: string | null }) => v.ownership === 'owned' || (!!v.ownerName && !!v.ownerDueBackOn)
const OWNER_MESSAGE = { message: 'Name the owner and when it goes back.', path: ['ownerName'] }

export const newItemsInput = z.object({
  ...itemDetails,
  tracking: z.enum(TRACKING),
  count,
  quantity: quantity.default(1),
  containerId: id.nullish().transform(v => v ?? null),
}).strict().refine(ownerNamed, OWNER_MESSAGE)
export type NewItemsInput = z.infer<typeof newItemsInput>

export const itemInput = z.object({
  ...itemDetails,
  categoryId: id,
  tracking: z.enum(TRACKING),
  quantity,
}).strict().refine(ownerNamed, OWNER_MESSAGE)
export type ItemInput = z.infer<typeof itemInput>

// The add and edit form's own state: one category chosen on the page, tags as ticked options.
export const itemForm = z.object(itemDetails).omit({ tagIds: true }).extend({
  categoryId: id,
  tracking: z.enum(TRACKING),
  count,
  quantity: quantity.default(1),
  tags: z.array(z.object({ value: id })).max(20).default([]), // not-policy: shape bound
}).refine(ownerNamed, OWNER_MESSAGE)
