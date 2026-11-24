// The shapes claim routes take, shared so each route validates the same fields the same way.
import { z } from 'zod'

const id = z.string().max(40) // not-policy: ids are short

export const claimFields = z.object({
  title: z.string().trim().min(1).max(80), // not-policy: the column's bound
  requestId: id.nullable().optional(),
}).strict()

export const itemFields = z.object({
  spentOn: z.iso.date(),
  description: z.string().trim().min(1).max(200), // not-policy: the column's bound
  supplier: z.string().trim().max(80).nullable().optional(), // not-policy: the column's bound
  amountMinor: z.number().int().positive().max(100_000_000), // not-policy: a sanity bound, a million pounds
  lineId: id.nullable().optional(),
  categoryId: id.nullable().optional(),
  noReceiptReason: z.string().trim().min(1).max(300).nullable().optional(), // not-policy: the column's bound
}).strict()

export const decisionNote = z.object({
  version: z.number().int().min(0),
  note: z.string().trim().min(1).max(500), // not-policy: the column's bound
}).strict()

export const approval = z.object({
  version: z.number().int().min(0),
  items: z.array(z.object({
    id,
    lineId: id,
    categoryId: id.nullable().optional(),
    approvedMinor: z.number().int().min(0).max(100_000_000), // not-policy: a sanity bound
    partReason: z.string().trim().min(1).max(300).nullable().optional(), // not-policy: the column's bound
  }).strict()).min(1).max(200), // not-policy: a sanity bound on one claim's items
}).strict()
