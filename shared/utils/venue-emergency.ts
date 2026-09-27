import { z } from 'zod'
import { SHIFT_ROLES, saysShiftRole } from './rota'
import type { ShiftRole } from './rota'

// The venue emergency card's vocabulary (E-113). Nothing here reads a request or the database;
// `server/utils/venue-emergency.ts` is where a version is actually written and read.

const FIELD_LIMIT = 1000
const NOTES_LIMIT = 2000

const field = () => z.string().trim().max(FIELD_LIMIT).nullish().transform(value => value?.trim() || null)

// The one line a volunteer reads aloud to a 999 handler, so a card without it is not a card
// (issue 902). Everything else on the form stays optional.
export const emergencyCardForm = z.object({
  address: z.string().trim().min(1, 'the address is what gets read to a 999 handler').max(FIELD_LIMIT),
  assemblyPoint: field(),
  exits: field(),
  isolationPoints: field(),
  firstAidKit: field(),
  defibrillator: field(),
  firstAiders: field(),
  firePanel: field(),
  what3words: z.string().trim().max(100).nullish().transform(value => value?.trim() || null),
  notes: z.string().trim().max(NOTES_LIMIT).nullish().transform(value => value?.trim() || null),
})

export type EmergencyCardInput = z.output<typeof emergencyCardForm>

export interface EmergencyCardCompleteness {
  address: string | null
  assemblyPoint: string | null
}

// What "filed" means on the committee's overview: a card nobody can read an address off is a
// blank page in the one moment it matters (E-113 criterion 1).
export function emergencyCardComplete(card: EmergencyCardCompleteness | null | undefined): boolean {
  return Boolean(card?.address && card.assemblyPoint)
}

// The card's own address is the one read to 999; the venue's address for audiences only starts
// a card that has none, so the two can differ from the first save on (issue 1352).
export function cardAddressDraft(cardAddress: string | null, venueAddress: string | null): string {
  return cardAddress ?? venueAddress ?? ''
}

// A cached answer outlives the person who fetched it on a shared phone, so its duty managers'
// numbers show only to that account; everybody else keeps the addresses without them (A-114).
export function emergencyCardsFor<T extends { dutyManagers: unknown[] | null }>(
  answer: { viewerId: string, cards: T[] } | null,
  viewerId: string | null,
): T[] | null {
  if (!answer) return null
  if (viewerId !== null && answer.viewerId === viewerId) return answer.cards
  return answer.cards.map(card => ({ ...card, dutyManagers: null }))
}

// A first name and the jobs they hold tonight: the card is read by anyone signed in (issue 1310).
export interface FirstAider { firstName: string, roles: ShiftRole[] }

const NOBODY_TRAINED = 'No trained first aider is on tonight\'s rota'

// Null tonight means no first-aid module is named, so the committee's own line is all there is
// (E-113 criterion 1 as amended).
export function saysFirstAiders(tonight: readonly FirstAider[] | null, filed: string | null): string[] {
  if (tonight === null) return filed ? [`First aiders tonight: ${filed}`] : []
  if (tonight.length === 0) return filed ? [NOBODY_TRAINED, filed] : [NOBODY_TRAINED]
  const named = tonight.map((one) => {
    const jobs = SHIFT_ROLES.filter(role => one.roles.includes(role)).map(role => saysShiftRole(role).toLowerCase())
    return `${one.firstName} (${jobs.join(', ')})`
  })
  return [`First aiders tonight: ${named.join(', ')}`]
}
