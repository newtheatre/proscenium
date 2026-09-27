import { z } from 'zod'
import { SHIFT_ROLES, saysShiftRole } from './rota'
import type { ShiftRole } from './rota'

// The venue emergency card's vocabulary (E-113). Nothing here reads a request or the database;
// `server/utils/venue-emergency.ts` is where a version is actually written and read.

const FIELD_LIMIT = 1000
const NOTES_LIMIT = 2000

const field = () => z.string().trim().max(FIELD_LIMIT).nullish().transform(value => value?.trim() || null)

// Written as dialled, so the telephone link is the number with its spaces taken out.
const DIALLABLE = /^\+?[\d ]{3,20}$/

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
  firstCallName: z.string().trim().max(80).nullish().transform(value => value?.trim() || null),
  firstCallPhone: z.string().trim().nullish().transform(value => value?.trim() || null)
    .refine(value => value === null || DIALLABLE.test(value), 'the number to ring first is digits and spaces, with a plus in front if it needs one'),
}).refine(card => (card.firstCallName === null) === (card.firstCallPhone === null), {
  message: 'who to ring first needs both a name and a number, or neither',
  path: ['firstCallPhone'],
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

// Who the screen offers to ring (issue 1519, 0106): a card's own first call, else 999.
export interface EmergencyCall { name: string, phone: string }

export const EMERGENCY_SERVICES: EmergencyCall = { name: '999', phone: '999' }

export interface FirstCall { firstCallName: string | null, firstCallPhone: string | null }

export function firstCallOf(card: FirstCall): EmergencyCall {
  return card.firstCallName && card.firstCallPhone ? { name: card.firstCallName, phone: card.firstCallPhone } : EMERGENCY_SERVICES
}

const digits = (phone: string): string => phone.replace(/\s+/g, '')

// Each first call once by number in card order, then 999, which every venue keeps (0106).
export function emergencyCalls(cards: readonly FirstCall[]): EmergencyCall[] {
  const calls = [...cards.filter(card => card.firstCallName && card.firstCallPhone).map(firstCallOf), EMERGENCY_SERVICES]
  return calls.filter((call, index) => calls.findIndex(one => digits(one.phone) === digits(call.phone)) === index)
}

export function emergencyCallHref(call: EmergencyCall): string {
  return `tel:${digits(call.phone)}`
}
