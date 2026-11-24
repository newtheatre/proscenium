// Route input shared by more than one route. Bounds are shapes, as the tables' CHECKs.
import { z } from 'zod'
import { CERTIFICATE, CONDITIONS, LENDS_TO, OWNERSHIP, TRACKING } from '../shared/states'

const note = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null)
const id = z.string().min(1).max(40) // not-policy: shape bound
const requirements = z.array(z.string().min(3).max(200)).max(10).default([]) // not-policy: shape bound

export const departmentInput = z.object({
  name: z.string().trim().min(1).max(60), // not-policy: as the table's CHECK
  tagPrefix: z.string().trim().toUpperCase().regex(/^[A-Z]{1,4}$/), // not-policy: as the table's CHECK
  lendsTo: z.enum(LENDS_TO),
  guidance: note(2000), // not-policy: as the table's CHECK
  contact: note(200), // not-policy: as the table's CHECK
  requirements,
}).strict()
export type DepartmentInput = z.infer<typeof departmentInput>

export const categoryInput = z.object({
  departmentId: id,
  name: z.string().trim().min(1).max(60), // not-policy: as the table's CHECK
  kindIds: z.array(id).max(20).default([]), // not-policy: shape bound
  requirements,
}).strict()
export type CategoryInput = z.infer<typeof categoryInput>

export const locationInput = z.object({
  name: z.string().trim().min(1).max(60), // not-policy: as the table's CHECK
  parentId: id.nullish().transform(v => v ?? null),
  venueId: id.nullish().transform(v => v ?? null),
  spaceId: id.nullish().transform(v => v ?? null),
}).strict()
export type LocationInput = z.infer<typeof locationInput>

export const kindInput = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: as the table's CHECK
  description: note(2000), // not-policy: as the table's CHECK
  intervalDays: z.number().int().min(1).max(3650), // not-policy: as the table's CHECK
  certificate: z.enum(CERTIFICATE),
  contractorAllowed: z.boolean(),
  blocksWhenOverdue: z.boolean(),
  inspectorRequirements: requirements,
}).strict()
export type KindInput = z.infer<typeof kindInput>

export const stateInput = z.object({ to: z.enum(['active', 'archived']) }).strict()

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: the shape of YYYY-MM-DD
const text = (max: number) => z.string().trim().max(max).nullish().transform(v => v || null)

// What an item says about itself, the same whether it is added or changed (spec part 2, inventory_items).
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
  // Several alike makes this many individual items; a counted item is one row with a quantity (I1, I4).
  count: z.number().int().min(1).max(2000).default(1), // not-policy: core.units.set-rows-limit's own ceiling
  quantity: z.number().int().min(1).max(1_000_000).default(1), // not-policy: shape bound
  containerId: id.nullish().transform(v => v ?? null),
}).strict().refine(ownerNamed, OWNER_MESSAGE)
export type NewItemsInput = z.infer<typeof newItemsInput>

export const itemInput = z.object({
  ...itemDetails,
  categoryId: id,
  tracking: z.enum(TRACKING),
  quantity: z.number().int().min(1).max(1_000_000), // not-policy: shape bound
}).strict().refine(ownerNamed, OWNER_MESSAGE)
export type ItemInput = z.infer<typeof itemInput>

export const moveInput = z.object({
  itemIds: z.array(id).min(1).max(200), // not-policy: shape bound
  locationId: id,
}).strict()
