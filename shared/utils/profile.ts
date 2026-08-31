import { z } from 'zod'

// One profile, and every field carries who can see it: criterion 1 asks for that before somebody
// fills it in, so the audience lives with the field rather than in copy on a screen (A-114).

export type Audience = 'you' | 'officers'

export const AUDIENCES: Record<Audience, string> = {
  you: 'Only you. Nobody else in the theatre can see this.',
  officers: 'You, and officers who can already look up accounts.',
}

export interface ProfileField {
  name: string
  label: string
  audience: Audience
  optional: boolean
}

export const PROFILE_FIELDS: ProfileField[] = [
  { name: 'name', label: 'Name', audience: 'officers', optional: false },
  { name: 'pronouns', label: 'Pronouns', audience: 'officers', optional: true },
  { name: 'phone', label: 'Phone number', audience: 'officers', optional: true },
  // The story's audience is duty managers and safety officers while a shift or production role is
  // held. Neither exists yet, so it denies everyone rather than opening wider than that (A-114).
  { name: 'emergencyName', label: 'Emergency contact', audience: 'you', optional: true },
  { name: 'emergencyPhone', label: 'Their phone number', audience: 'you', optional: true },
  { name: 'emergencyRelation', label: 'How you know them', audience: 'you', optional: true },
]

// Blank is no answer, not an empty answer: a stored empty string reads as somebody having chosen
// to say nothing, which is not the same as never having been asked.
const optionalText = (max: number) => z.string().trim().max(max).nullish()
  .transform(value => (value ?? '').trim() || null)

export const profileForm = z.object({
  name: z.string().trim().min(1).max(200),
  pronouns: optionalText(80),
  phone: optionalText(40),
  emergencyName: optionalText(200),
  emergencyPhone: optionalText(40),
  emergencyRelation: optionalText(80),
}).refine(
  profile => profile.emergencyPhone !== null || profile.emergencyName === null,
  { path: ['emergencyPhone'], message: 'An emergency contact needs a number to reach them on' },
)
