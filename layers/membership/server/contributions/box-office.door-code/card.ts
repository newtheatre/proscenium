// The membership card (MEM-51; tab 5, "The membership card"): Membership's kind `mem` on Box office's
// code point box-office.door-code. Box office signs the card with its current key each time My
// membership is opened; a scan at the door or the desk shows whether the membership is current and
// admits nobody. Membership holds no key and imports nothing from Box office: the shape below is the
// point's contract.
//
// The code part is the membership's id. It finds the membership again and proves nothing alone: only
// Box office's signature makes it a card.
import { first, localDate, useContext, useSetting } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import { addDays } from '../../dates'
import { memberNumber } from '../../memberships'

interface Card { id: string, scheme_name: string, account_id: string, state: string, starts_on: string, ends_on: string | null, grace_days: number }

const CARD = 'SELECT m.id, s.name AS scheme_name, m.account_id, m.state, m.starts_on, m.ends_on, s.grace_days FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id'

export default {
  kind: 'mem',
  ability: 'membership.card.check',

  /** A card for the holder's own active membership that has not lapsed, while cards are offered. */
  async issue(membershipId: string): Promise<string | null> {
    const accountId = useContext().actor.accountId
    if (!accountId || await useSetting('membership.card.show') === false) return null
    const day = await localDate()
    const card = await first<{ id: string }>(
      `SELECT m.id FROM membership_memberships m JOIN membership_schemes s ON s.id = m.scheme_id WHERE m.id = ?1 AND m.state = 'active' AND m.account_id IN (${accountScopeSql('?2')}) AND (m.ends_on IS NULL OR date(m.ends_on, '+' || s.grace_days || ' days') >= ?3)`,
      membershipId, accountId, day,
    )
    return card?.id ?? null
  },

  /** The same summary as a check, with the scheme and the number: never the holder's name. */
  async resolve(code: string): Promise<{ headline: string, line: string, state: 'ok' | 'attention' } | null> {
    const card = await first<Card>(`${CARD} WHERE m.id = ?`, code)
    if (!card) return null
    const number = await memberNumber(card.account_id)
    const who = number ? `${card.scheme_name}, member ${number.label}` : card.scheme_name
    const day = await localDate()
    if (card.state !== 'active') return { headline: 'Not a current member', line: `${who}: this membership is not current. Ask to see their account.`, state: 'attention' }
    if (card.starts_on > day) return { headline: 'Not yet a member', line: `${who}: starts on ${card.starts_on}.`, state: 'attention' }
    if (card.ends_on && card.ends_on < day) {
      // In grace the member price still holds (D1), so the card says so; after it, the card has ended.
      const graceUntil = addDays(card.ends_on, card.grace_days)
      if (graceUntil >= day) return { headline: 'Member, in grace', line: `${who}: ended on ${card.ends_on}, still counted until ${graceUntil}.`, state: 'attention' }
      return { headline: 'Membership ended', line: `${who}: ended on ${card.ends_on}.`, state: 'attention' }
    }
    return { headline: 'Member', line: `${who}: ${card.ends_on ? `current until ${card.ends_on}` : 'current, with no end date'}.`, state: 'ok' }
  },
}
