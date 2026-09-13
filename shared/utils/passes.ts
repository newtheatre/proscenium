import { z } from 'zod'
import { plural } from './text'

// Issuing a pass at the desk, and requesting one online ahead of payment (D-124). D-123's own
// product shape lives in shared/utils/pass-types.ts; this is what building on top of it adds.

// No look-alikes, the same alphabet a reservation's own reference uses (docs/data-model.md): a
// pass reference is read aloud at a desk and typed into a search box, never a credential.
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const PASS_REFERENCE_LENGTH = 6

export function generatePassReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(PASS_REFERENCE_LENGTH))
  return [...bytes].map(byte => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join('')
}

export const PASS_STATUSES = ['ACTIVE', 'CANCELLED', 'EXPIRED'] as const
export type PassStatus = (typeof PASS_STATUSES)[number]

export const PASS_REQUEST_STATUSES = ['PENDING', 'FULFILLED', 'DECLINED', 'EXPIRED'] as const
export type PassRequestStatus = (typeof PASS_REQUEST_STATUSES)[number]

// One sentence-case reading for a pass or a request for one: the enum is the storage, never the
// screen (compare `saysShiftStatus`).
export function saysPassStatus(status: PassStatus | PassRequestStatus): string {
  if (status === 'ACTIVE') return 'Active'
  if (status === 'PENDING') return 'Pending'
  if (status === 'FULFILLED') return 'Fulfilled'
  if (status === 'DECLINED') return 'Declined'
  if (status === 'EXPIRED') return 'Expired'
  return 'Cancelled'
}

// Criterion 1: sold on the reader under the same cross-check D-114 collection uses. `userId` is
// the buyer's own account, chosen at the desk, never typed as an id (K-123 criterion 1).
export const issuePassForm = z.strictObject({
  passTypeId: z.string().trim().min(1),
  passTypePriceId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  expectedTotalPence: z.number().int().min(0),
  // Fulfils the named request in the same batch as issuing, one-tap at payment (criterion 3).
  requestId: z.string().trim().min(1).optional(),
})

export type IssuePassInput = z.output<typeof issuePassForm>

// Criterion 3: a signed-in member names only which product; nothing about price or payment.
export const requestPassForm = z.strictObject({
  passTypeId: z.string().trim().min(1),
})

export type RequestPassInput = z.output<typeof requestPassForm>

// Criterion 4: the cap is asked at the statement that issues, never trusted from a read taken
// earlier; this is only what the refusal says once that statement has already decided.
export function passCapReason(maxIssued: number | null): string | null {
  if (maxIssued === null) return null
  return `This pass is capped at ${plural(maxIssued, 'issue')}, and that many are already out.`
}

export interface PassTypeSaleState {
  status: string
  salesOpenAt: number | null
  salesCloseAt: number | null
}

// The one question issuing and requesting both ask, in the booker's own words rather than the
// product's internal status; a request is scoped to the same window issuing is (criterion 3).
export function passSaleRefusal(type: PassTypeSaleState, now: number): string | null {
  if (type.status === 'DRAFT') return 'This pass is not on sale yet.'
  if (type.status !== 'ON_SALE') return 'This pass is no longer on sale.'
  if (type.salesOpenAt !== null && now < type.salesOpenAt) return 'This pass is not on sale yet.'
  if (type.salesCloseAt !== null && now >= type.salesCloseAt) return 'This pass is no longer on sale.'
  return null
}

// D-125 redeems while reserving, D-126 at the door, D-130 for a Fellow's own pass: all three
// share this shape. server/utils/pass-redemption.ts's `passAdmissionAllows` is what decides.
export const redeemPassForm = z.strictObject({
  performanceId: z.string().trim().min(1),
})

export type RedeemPassInput = z.output<typeof redeemPassForm>

export interface PassRedemptionState {
  status: string
  passTypeStatus: string
  validFrom: number
  validUntil: number
  coversShow: boolean
  // Erased (D-130): checked ahead of everything else, since none of the other facts matter once
  // nobody can any longer be reached through this account (0062).
  anonymised?: boolean
}

// Criterion 1: covered, inside the validity window, and a live product. Once-per-performance and
// capacity are contended, so the database predicate decides those, never a read taken here (0003).
export function passRedemptionRefusal(pass: PassRedemptionState, now: number): string | null {
  if (pass.anonymised) return 'This account has been closed and can no longer be admitted.'
  if (pass.status !== 'ACTIVE') return 'This pass is not active.'
  if (pass.passTypeStatus === 'CLOSED') return 'This pass has been archived and no longer admits.'
  if (now < pass.validFrom) return 'This pass is not valid yet.'
  if (now > pass.validUntil) return 'This pass has expired.'
  if (!pass.coversShow) return 'This pass does not cover this show.'
  return null
}

// D-126: the door reads a pass the same way a desk search reads a reservation, by its own
// no-look-alike reference, never a QR token scheme built for the holder's own phone.
export const doorPassScanForm = z.strictObject({
  reference: z.string().trim().min(1),
  performanceId: z.string().trim().min(1),
})

export type DoorPassScanInput = z.output<typeof doorPassScanForm>
