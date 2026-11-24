// Calendar feed (C-70): one private address per person, /calendar/<token>.ics, with everything they
// are on from every core.calendar-feed contributor. A support module (C-65): on while a module that
// requires it is on, such as Front of house.
import { defineModule } from '#kit'
import { tables } from './server/db/schema'

export default defineModule({
  id: 'calendar-feed',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  support: true,

  tables,

  contributes: {
    'core.navigation': [
      { id: 'calendar-feed.mine', menu: 'account', group: 'theatre', to: '/account/calendar', icon: 'i-lucide-calendar-sync', ability: 'signed-in', order: 45 },
    ],
    'core.account-section': [
      { id: 'calendar-feed.address', target: 'account' as const, side: 'members' as const, ability: 'signed-in', component: 'CalendarFeedAddress', order: 60, to: '/account/calendar', icon: 'i-lucide-calendar-sync' },
    ],
  },
})
