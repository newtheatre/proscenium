// Requests I have sent (S11): the organiser's requests with counts, the groups they may ask and the
// answer date a new request offers.
import { defineRoute, useSetting } from '#kit'
import { entryDates } from '../../../entries'
import { plannedGroups } from '../../../planning'
import { sentRequests } from '../../../requests'
import { addDays } from '../../../../shared/grid'

const DAY_SECONDS = 86_400 // not-policy: a day

export default defineRoute({ ability: 'availability.request.send', rateLimit: 'default' }, async (_event, { actor }) => {
  const { today } = await entryDates()
  const due = Math.round((await useSetting('availability.requests.default-due') as number) / DAY_SECONDS)
  return { today, defaultDue: addDays(today, due), groups: await plannedGroups(actor.accountId!), requests: await sentRequests(actor.accountId!) }
})
