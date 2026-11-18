// The award holder's card: Awards' kind `awd` on Box office's code point box-office.door-code. Box
// office signs the card with its current key each time My awards opens it; a scan at the door or
// the desk shows whether the award is current and admits nobody. Awards holds no key and imports
// nothing from Box office: the shape below is the point's contract.
//
// The code part is the award's id. It finds the award again and proves nothing alone: only Box
// office's signature makes it a card. A card is offered for an award that carries a ticket price.
import { first, useContext } from '#kit'
import { accountScopeSql } from '#kit/accounts'

export default {
  kind: 'awd',
  ability: 'awards.award.check',

  /** A card for the holder's own current award of a type that carries a ticket price. */
  async issue(awardId: string): Promise<string | null> {
    const accountId = useContext().actor.accountId
    if (!accountId) return null
    const card = await first<{ id: string }>(
      `SELECT a.id FROM awards_awards a JOIN awards_types t ON t.id = a.type_id WHERE a.id = ?1 AND a.state = 'current' AND t.gives_ticket_benefit = 1 AND a.account_id IN (${accountScopeSql('?2')})`,
      awardId, accountId,
    )
    return card?.id ?? null
  },

  /** The award's holder, for the till, which then checks the ticket's requirement against their account. */
  async holder(code: string): Promise<string | null> {
    return (await first<{ account_id: string }>('SELECT account_id FROM awards_awards WHERE id = ?', code))?.account_id ?? null
  },

  /** What the award is and whether it is current: never the holder's name. */
  async resolve(code: string): Promise<{ headline: string, line: string, state: 'ok' | 'attention' } | null> {
    const card = await first<{ name: string, state: string, awarded_on: string, benefit: number }>(
      'SELECT t.name, a.state, a.awarded_on, t.gives_ticket_benefit AS benefit FROM awards_awards a JOIN awards_types t ON t.id = a.type_id WHERE a.id = ?',
      code,
    )
    if (!card) return null
    if (card.state !== 'current') return { headline: 'Award revoked', line: `${card.name}: this award is no longer held.`, state: 'attention' }
    if (!card.benefit) return { headline: card.name, line: `${card.name}, awarded on ${card.awarded_on}: current, with no ticket price.`, state: 'attention' }
    return { headline: card.name, line: `${card.name}, awarded on ${card.awarded_on}: current.`, state: 'ok' }
  },
}
