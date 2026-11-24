// Sample set core.people (Practice mode, part 4; C-76): the store's "Practice staff", the person
// practising under their own display name, and fictional people from the catalogue's list, each at
// an address that can never be delivered to and a phone number from the range kept for drama.
import { definePracticeSample, wordsFrom } from '#kit'
import { newId } from '#kit/ids'
import { accounts, accountEmails } from '../../db/identity'
import en from '../../../i18n/en-GB.json'

const t = wordsFrom(en)

/** The fictional names, from core's catalogue: never made from real ones. */
export function practiceNames(): string[] {
  return t('core.practice.sample-names').split(',').map(n => n.trim()).filter(Boolean)
}

/** An address under the reserved .invalid domain (RFC 2606), so even an escaped send goes nowhere. */
export const practiceAddress = (name: string) => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@practice.invalid`

/** Ofcom's range for drama, 07700 900000 to 07700 900999. */
export const practicePhone = (n: number) => `07700 900${String(n % 1000).padStart(3, '0')}` // not-policy: Ofcom's drama range

export default definePracticeSample({
  seed(unit, { accountId, name, staffId }) {
    const people = practiceNames().map((person, i) => ({ id: newId('acc'), name: person, phone: practicePhone(i + 1), origin: 'staff' as const }))
    unit.insertSet(accounts, [
      { id: staffId, name: t('core.practice.staff-name'), phone: null, origin: 'staff' },
      { id: accountId, name: name ?? t('core.practice.you'), phone: null, origin: 'staff' },
      ...people,
    ])
    unit.insertSet(accountEmails, people.map(p => ({ accountId: p.id, address: practiceAddress(p.name), addedBy: 'staff' })))
    return Object.fromEntries(people.slice(0, 5).map((p, i) => [`person${i + 1}`, p.id])) // not-policy: the first few named for later sets
  },
})
