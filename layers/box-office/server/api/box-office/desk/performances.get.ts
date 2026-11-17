// The performances the desk can sell for now, each with what is free and what it costs, and whether
// this seller may pick a buyer by name (the person picker needs core.account.search; without it the
// seller types the buyer's address).
import { can, defineRoute, useContext } from '#kit'
import { deskPerformances } from '../../../desk'

export default defineRoute({ ability: 'box-office.order.view', rateLimit: 'default' }, async () => ({
  performances: await deskPerformances(),
  searchPeople: (await can(useContext().actor, 'core.account.search')).allowed,
}))
