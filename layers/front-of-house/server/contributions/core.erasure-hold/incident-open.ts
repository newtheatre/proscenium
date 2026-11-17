// An account listed on an incident that is not closed waits to be erased until the incident closes.
import { erasureHolds } from '../../privacy'

export default {
  holds: accountId => erasureHolds(accountId),
} satisfies { holds: (accountId: string) => Promise<string[]> }
