// Route input shared by more than one route. Bounds are shapes, as the tables' CHECKs.
import { z } from 'zod'
import { CERTIFICATE, LENDS_TO } from '../shared/states'

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

export const moveInput = z.object({
  itemIds: z.array(id).min(1).max(200), // not-policy: shape bound
  locationId: id,
}).strict()
