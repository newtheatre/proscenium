import { z } from 'zod'

// The Access Card categories (Nimbus Disability), so a patron who carries one recognises our
// questions and we recognise their card. Ours to maintain: the published symbol set has changed
// before and a change here is a documentation change, never a migration (D-127).
export const ACCESS_NEED_FLAGS = [
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

export type AccessNeedFlag = (typeof ACCESS_NEED_FLAGS)[number]
export type AccessNeeds = Record<AccessNeedFlag, boolean>

export const ACCESS_NEED_LABELS: Record<AccessNeedFlag, string> = {
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

export const ACCESS_PROFILE_STATUSES = ['PENDING', 'VERIFIED', 'DECLINED', 'WITHDRAWN'] as const
export type AccessProfileStatus = (typeof ACCESS_PROFILE_STATUSES)[number]

export const MAX_ACCESS_COMPANIONS = 2
// Withdrawal is a tombstone, not instant deletion, so a slip of the withdraw button is recoverable
// by its owner; GDPR erasure is immediate and bypasses this window entirely (D-127 criterion 5).
export const WITHDRAWAL_TOMBSTONE_DAYS = 30

const needsShape = Object.fromEntries(ACCESS_NEED_FLAGS.map(flag => [flag, z.boolean().default(false)])) as Record<AccessNeedFlag, z.ZodDefault<z.ZodBoolean>>

// What the patron declares. Evidence such as an access card is sighted at verification and never
// stored beyond a short reference the officer can recognise a returning holder by.
export const declareAccessProfileForm = z.object({
  needs: z.object(needsShape),
  companions: z.number().int().min(0).max(MAX_ACCESS_COMPANIONS),
  requesterNote: z.string().trim().max(1000).nullish(),
  accessCardReference: z.string().trim().max(40).nullish(),
})

export type DeclareAccessProfileInput = z.infer<typeof declareAccessProfileForm>

// Everything the encrypted payload carries. `fohNote` is the officer's agreed operational
// wording, set only at verification, never by the patron (D-127 criterion 3).
export interface AccessProfilePayload {
  needs: AccessNeeds
  companions: number
  requesterNote: string | null
  accessCardReference: string | null
  fohNote: string | null
}

export const verifyAccessProfileForm = z.object({
  decision: z.enum(['VERIFIED', 'DECLINED']),
  fohNote: z.string().trim().max(300).nullish(),
  // Null means the profile does not expire on its own; a re-check still applies (workshop-free:
  // the story states no default period, so none is guessed, 0019).
  expiresAt: z.number().int().positive().nullish(),
})

export interface AccessProfileMeta {
  userId: string
  status: AccessProfileStatus
  consentForhAt: number | null
  verifiedBy: string | null
  verifiedAt: number | null
  expiresAt: number | null
  withdrawnAt: number | null
  createdAt: number
  updatedAt: number
}

// The three conditions the door needs together, none of them a proxy for the others: verified by
// the officer, consented to by the patron, and not run out (D-127 criterion 2).
export function isAccessProfileVisible(profile: Pick<AccessProfileMeta, 'status' | 'consentForhAt' | 'expiresAt'>, now: Date): boolean {
  if (profile.status !== 'VERIFIED') return false
  if (profile.consentForhAt === null) return false
  if (profile.expiresAt !== null && profile.expiresAt * 1000 <= now.getTime()) return false
  return true
}

// A separate question from visibility: whether the tombstone window has run out, for a sweep to
// act on rather than a comparison scattered across call sites.
export function tombstoneExpired(withdrawnAt: number, now: Date): boolean {
  return withdrawnAt + WITHDRAWAL_TOMBSTONE_DAYS * 24 * 60 * 60 <= Math.floor(now.getTime() / 1000)
}
