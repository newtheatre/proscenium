// Exports read the whole ledger through Finance's entryRows, so taking one also needs finance.ledger.view (part 6).
import { requireAbility, type Actor } from '#kit'

export const requireLedgerView = (actor: Actor) => requireAbility(actor, 'finance.ledger.view')
