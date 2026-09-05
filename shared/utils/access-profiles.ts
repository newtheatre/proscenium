import { z } from 'zod'

// The Nimbus Access Card categories (docs/data-model.md), our column names rather than its
// vocabulary: the symbol set has changed before and the mapping is ours to maintain (D-127).

export const ACCESS_FLAGS = [
  'standing',
  'crowds',
  'levelAccess',
  'distance',
  'urgentToilet',
  'essentialCompanion',
  'visualInformation',
  'audibleInformation',
  'other',
] as const

export type AccessFlag = (typeof ACCESS_FLAGS)[number]

export const ACCESS_FLAG_LABELS: Record<AccessFlag, string> = {
  standing: 'Standing for long periods is difficult or impossible',
  crowds: 'Crowded settings cause overwhelm',
  levelAccess: 'Wheelchair accessible facilities, or level access, are required',
  distance: 'Moving more than short distances is restricted',
  urgentToilet: 'Prompt toilet access is needed, without queueing',
  essentialCompanion: 'Access is significantly difficult without support from another person',
  visualInformation: 'Visual information is a barrier; alternative formats are needed',
  audibleInformation: 'Audible information is difficult to access or process',
  other: 'Anything the categories above do not cover, such as photosensitive epilepsy',
}

export const ACCESS_PROFILE_STATUSES = ['PENDING', 'VERIFIED', 'EXPIRED', 'DECLINED', 'WITHDRAWN'] as const
export type AccessProfileStatus = (typeof ACCESS_PROFILE_STATUSES)[number]

export const MAX_COMPANIONS = 2
export const MAX_NOTE_LENGTH = 500
export const MAX_CARD_NUMBER_LENGTH = 40

// Withdrawal tombstones for 30 days before the sweep deletes the row outright; a story figure,
// not a workshop one (D-127 criterion 5).
export const WITHDRAWAL_TOMBSTONE_DAYS = 30

// What lives inside the encrypted payload. Nothing here is ever written to a plain column or to
// audit detail (D-127 criterion 4, 0011).
export interface AccessProfilePayload {
  flags: Record<AccessFlag, boolean>
  requesterNote: string | null
  fohNote: string | null
  // Self-declared, sighted at verification and cleared the moment it is (D-127 criterion 1).
  accessCardNumber: string | null
}

const flagsShape = Object.fromEntries(ACCESS_FLAGS.map(flag => [flag, z.boolean().default(false)])) as
  Record<AccessFlag, z.ZodDefault<z.ZodBoolean>>

// Blank is no answer, not an empty one, the same rule the account profile form follows.
const optionalText = (max: number): z.ZodType<string | null> => z.string().trim().max(max).nullish()
  .transform(value => (value ?? '').trim() || null)

// What a patron submits. The agreed door wording is the officer's to set, not theirs (D-127
// criterion 3), so it has no place in this form.
export const declareAccessProfileForm = z.strictObject({
  flags: z.strictObject(flagsShape),
  companions: z.number().int().min(0).max(MAX_COMPANIONS),
  requesterNote: optionalText(MAX_NOTE_LENGTH),
  accessCardNumber: optionalText(MAX_CARD_NUMBER_LENGTH),
  // Whether the door may be shown the agreed wording once it exists. The owner's choice, set
  // with the declaration and changeable independently of verification (D-127 criterion 2).
  consent: z.boolean(),
})

export type DeclareAccessProfileInput = z.output<typeof declareAccessProfileForm>

export const verifyAccessProfileForm = z.strictObject({
  fohNote: z.string().trim().min(1, 'Agreed wording is what the door reads out').max(200),
})

// What the owner sees of their own declaration: every flag, both notes, the lot.
export interface OwnAccessProfile {
  status: AccessProfileStatus
  flags: Record<AccessFlag, boolean>
  companions: number
  requesterNote: string | null
  fohNote: string | null
  accessCardNumber: string | null
  consentGiven: boolean
  verifiedAt: number | null
  expiresAt: number | null
}

// What a staff surface may ever see: the agreed wording, once every gate holds, and nothing that
// could tell it why (D-127 criterion 2, criterion 3).
export function doorWording(profile: {
  status: AccessProfileStatus
  consentFohAt: number | null
  expiresAt: number | null
  fohNote: string | null
} | null, now: number): string | null {
  if (!profile) return null
  if (profile.status !== 'VERIFIED') return null
  if (profile.consentFohAt === null) return null
  if (profile.expiresAt !== null && profile.expiresAt <= now) return null
  return profile.fohNote
}

// Enforced at read time, the same as a role grant (0009): a verification past its expiry reads
// as EXPIRED without a sweep having to flip the stored column first.
export function effectiveStatus(row: { status: AccessProfileStatus, expiresAt: number | null }, now: number): AccessProfileStatus {
  if (row.status === 'VERIFIED' && row.expiresAt !== null && row.expiresAt <= now) return 'EXPIRED'
  return row.status
}

// What a stored row's `status` column reads as: a CHECK constraint holds it to the five values
// at write time, so a cast here only ever restates what the database has already enforced.
export function asAccessProfileStatus(value: string): AccessProfileStatus {
  return value as AccessProfileStatus
}

// A light summary for the officer's list: no encrypted payload, so nothing here needs decrypting.
export interface AccessProfileSummary {
  userId: string
  name: string
  email: string
  status: AccessProfileStatus
  companions: number
  createdAt: number
  updatedAt: number
}

// What the accessibility officer reads to decide: everything the owner sees, plus who they are
// and who verified them. Never sent anywhere but this one screen (D-127 criterion 2).
export interface OfficerAccessProfile extends OwnAccessProfile {
  userId: string
  name: string
  email: string
  verifiedBy: string | null
}
