// Route input shared by more than one route.
import { z } from 'zod'

export const dutyInput = z.object({
  name: z.string().trim().min(1).max(60), // not-policy: shape bound, as the table's CHECK
  description: z.string().trim().max(500).nullish(), // not-policy: shape bound
  isLead: z.boolean().optional(),
  callBeforeMinutes: z.number().int().min(0).max(480), // not-policy: shape bound, as the table's CHECK
  stayAfterMinutes: z.number().int().min(0).max(480), // not-policy: shape bound, as the table's CHECK
  requirements: z.array(z.string().min(3).max(200)).max(10).optional(), // not-policy: shape bound
  sortOrder: z.number().int().min(0).max(1000).optional(), // not-policy: shape bound
}).strict()

export const templateInput = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: shape bound, as the table's CHECK
  venueId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
  isDefault: z.boolean().optional(),
  lines: z.array(z.object({
    dutyId: z.string().min(1).max(40), // not-policy: shape bound
    places: z.number().int().min(1).max(50), // not-policy: shape bound, as the table's CHECK
  }).strict()).max(40), // not-policy: shape bound
}).strict()

// Bulk actions name at most this many performances, so one unit stays within the set limit.
export const performanceIds = z.array(z.string().min(1).max(40)).min(1).max(60) // not-policy: shape bound

export const checklistInput = z.object({
  name: z.string().trim().min(1).max(80), // not-policy: shape bound, as the table's CHECK
  moment: z.enum(['pre-show', 'post-show', 'other']),
  venueId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
  dutyId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
  sortOrder: z.number().int().min(0).max(1000).optional(), // not-policy: shape bound
  items: z.array(z.object({
    id: z.string().min(1).max(40).optional(), // not-policy: shape bound
    label: z.string().trim().min(1).max(160), // not-policy: shape bound, as the table's CHECK
    help: z.string().trim().max(500).nullish(), // not-policy: shape bound, as the table's CHECK
    kind: z.enum(['tick', 'reading']).optional(),
    unit: z.string().trim().max(20).nullish(), // not-policy: shape bound, as the table's CHECK
    required: z.boolean().optional(),
  }).strict()).max(60), // not-policy: shape bound
}).strict()

export const personInput = z.object({
  accountId: z.string().min(1).max(40).nullish(), // not-policy: shape bound
  name: z.string().trim().min(1).max(120).nullish(), // not-policy: shape bound, as the table's CHECK
  contact: z.string().trim().max(200).nullish(), // not-policy: shape bound, as the table's CHECK
  involvement: z.enum(['affected', 'witness', 'helped', 'other']),
  isChild: z.boolean().optional(),
  details: z.string().trim().max(2000).nullish(), // not-policy: shape bound
}).strict()

// Calls at or after `from` and before `to`, in UTC milliseconds.
export const hoursQuery = z.object({
  from: z.coerce.number().int().nonnegative(),
  to: z.coerce.number().int().positive(),
  accountId: z.string().min(1).max(40).optional(), // not-policy: shape bound
  dutyId: z.string().min(1).max(40).optional(), // not-policy: shape bound
})
