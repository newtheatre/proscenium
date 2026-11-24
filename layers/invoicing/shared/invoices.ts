// Invoice arithmetic and the draft's shape (Invoices and exports, rules I-05 and I-42), shared so the
// screen shows the figures the server will work out. The server's figures are the ones that count.
import { z } from 'zod'

const MILLI = 1000 // not-policy: quantities are held in thousandths
const BASIS = 10_000 // not-policy: rates are held in basis points

/** Half away from zero, for amounts that are never negative here. */
function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((numerator + denominator / 2) / denominator) // not-policy: halving for rounding
}

/** A line's net: quantity times unit price, to the penny (I-05). */
export function lineNet(quantityMilli: number, unitMinor: number): number {
  return roundHalfUp(quantityMilli * unitMinor, MILLI)
}

/** A line's VAT: its net times its code's rate, to the penny (I-42). */
export function lineTax(netMinor: number, rateBp: number): number {
  return rateBp ? roundHalfUp(netMinor * rateBp, BASIS) : 0
}

/** "INV-0042" from a series' prefix and padding. */
export function formatNumber(prefix: string, pad: number, n: number): string {
  return `${prefix}${String(n).padStart(pad, '0')}`
}

export const draftLine = z.object({
  description: z.string().trim().min(1).max(300), // not-policy: the column's bound
  quantityMilli: z.number().int().min(1).max(1_000_000_000), // not-policy: the column's bound
  unitMinor: z.number().int().min(0).max(100_000_000_00), // not-policy: a sanity bound of a million pounds
  accountId: z.string().min(1),
  taxCode: z.string().min(1).max(32).optional(), // not-policy: Finance's code length
  productionId: z.string().min(1).nullable().optional(),
}).strict()

export const draftParty = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('account'), accountId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('one-off') }).strict(),
])

export const draftFields = z.object({
  party: draftParty,
  billToName: z.string().trim().max(120).optional(), // not-policy: the column's bound
  billToAddress: z.string().trim().max(400).default(''), // not-policy: the column's bound
  billToEmail: z.email().max(254).nullable().optional(), // not-policy: the longest address
  taxNumber: z.string().trim().max(30).default(''), // not-policy: the column's bound
  reference: z.string().trim().max(60).default(''), // not-policy: the column's bound
  suppliedOn: z.iso.date().nullable().optional(),
  notes: z.string().trim().max(1000).default(''), // not-policy: the column's bound
  internalNote: z.string().trim().max(1000).default(''), // not-policy: the column's bound
  lines: z.array(draftLine).max(200), // not-policy: lines one invoice holds
}).strict()
export type DraftInput = z.infer<typeof draftFields>

/** A bill's line: as an invoice's, with the VAT typed from the supplier's invoice (I-43). */
export const billLine = z.object({
  description: z.string().trim().min(1).max(300), // not-policy: the column's bound
  quantityMilli: z.number().int().min(1).max(1_000_000_000).default(1000), // not-policy: the column's bound; one by default
  unitMinor: z.number().int().min(0).max(100_000_000_00), // not-policy: a sanity bound of a million pounds
  accountId: z.string().min(1),
  taxCode: z.string().min(1).max(32).optional(), // not-policy: Finance's code length
  taxMinor: z.number().int().min(0).optional(),
  productionId: z.string().min(1).nullable().optional(),
}).strict()

export const billFields = z.object({
  party: draftParty,
  billToName: z.string().trim().max(120).optional(), // not-policy: the column's bound
  supplierNumber: z.string().trim().max(60).default(''), // not-policy: a supplier's invoice number
  issueOn: z.iso.date().nullable().optional(),
  dueOn: z.iso.date().nullable().optional(),
  taxNumber: z.string().trim().max(30).default(''), // not-policy: the column's bound
  internalNote: z.string().trim().max(1000).default(''), // not-policy: the column's bound
  lines: z.array(billLine).max(200), // not-policy: lines one bill holds
}).strict()
export type BillInput = z.infer<typeof billFields>
