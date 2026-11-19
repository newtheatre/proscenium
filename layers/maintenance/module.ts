// Maintenance mode: a module a theatre switches on for a few hours, rarely (a move to a new system,
// a big import), and off again. While it is on, the public site and online booking answer with a
// holding page that says what is happening and how to reach the box office, with 503 and Retry-After
// so search engines keep the pages they know. Staff (anyone the console, Admin or live mode is open
// to) carry on as usual: they sign in, sell, scan and change settings. Links already sent by email,
// such as a booking's tickets, keep working where their module says so (maintenance.open-address).
// Being on is the whole switch: there is no separate "closed" setting to forget.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineSettings, point, setting } from '#kit'

const change = 'maintenance.notice.edit'

export default defineModule({
  id: 'maintenance',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',

  settings: defineSettings('maintenance', {
    // The holding page's words. Unset uses the wording in the module's catalogue.
    'notice.heading': setting.text({ unset: true, maxLength: 120, change, audience: 'public' }), // not-policy: one line
    'notice.message': setting.text({ unset: true, maxLength: 1000, multiline: true, change, audience: 'public' }), // not-policy: a short paragraph or two
    // When the theatre expects to be back, in its own words ("by 6pm", "on Monday morning").
    'notice.back-by': setting.text({ unset: true, maxLength: 60, change, audience: 'public' }), // not-policy: a few words
    // Sent as Retry-After, so search engines and other machines know when to try again.
    'search.retry-after': setting.duration({ default: '1h', min: '5m', max: '1d', change, audience: 'staff' }),
  }),
  settingGroups: {
    search: { advanced: true },
  },

  points: {
    // An address that stays open to everybody while maintenance mode is on: a page a link already
    // sent by email opens (a booking's tickets), or the API route behind it. A prefix of the path.
    'maintenance.open-address': point({
      kind: 'data',
      schema: z.object({
        id: z.string(),
        prefix: z.string().regex(/^\/[a-z0-9\-/]+$/).max(100), // not-policy: an address prefix
      }).strict(),
    }),
  },

  contributes: {
    // On the Admin overview while it is on, so nobody forgets to switch it off.
    'core.home-card': [{ id: 'maintenance.on', home: 'admin', ability: 'core.modules.manage', component: 'MaintenanceOnCard', urgency: 'today' }],
  },

  abilities: defineAbilities('maintenance', {
    'notice.edit': ability(),
  }),
})
