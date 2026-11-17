// Membership (Membership specification): schemes and their lengths, memberships, the standing a
// members' scheme gives and the reference lists a scheme checks against. Free membership needs no
// money: fees are the separate membership-fees module. This file grows with the build; it declares
// only what the code so far uses.
//
// The specification has `requires: ['forms']`. The form builder is not built yet, and the gate
// needs no form (tab 7), so forms is only used until the application form is wired in.
import { z } from 'zod'
import { ability, defineAbilities, defineFacts, defineModule, defineRecords, defineSettingRules, defineSettings, event, factDecl, setting } from '#kit'
import { tables } from './server/db/schema'

const change = 'membership.settings.manage'
const scheme = z.object({ schemeId: z.string() })
const membership = z.object({ membershipId: z.string(), schemeId: z.string(), accountId: z.string() })

export default defineModule({
  id: 'membership',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  uses: ['forms', 'communications', 'box-office', 'front-of-house'],

  settings: defineSettings('membership', {
    'applications.expire-after': setting.duration({ default: '14d', min: '1d', max: '90d', change, audience: 'public', quotable: true }),
    'renewal.opens-before': setting.duration({ default: '30d', min: '0d', max: '180d', change, audience: 'staff' }),
    'renewal.grace': setting.duration({ default: '0d', min: '0d', max: '90d', change, audience: 'staff' }),
    'reminders.first': setting.duration({ default: '30d', min: '1d', max: '180d', change, audience: 'staff' }),
    'reminders.final': setting.duration({ default: '7d', min: '1d', max: '60d', change, audience: 'staff' }),
    'reminders.after-lapse': setting.boolean({ default: true, change, audience: 'staff' }),
    'numbers.prefix': setting.text({ default: 'M-', maxLength: 8, change, audience: 'public' }),
    'join.public-listing': setting.boolean({ default: true, change, audience: 'public' }),
    'card.show': setting.boolean({ default: true, change, audience: 'public' }),
    'voting.qualifying-period': setting.duration({ default: '0d', min: '0d', max: '365d', change, audience: 'public', quotable: true, onChange: 'confirm' }),
    'verification.list-keep-for': setting.duration({ default: '400d', min: '30d', max: '800d', change, audience: 'public', quotable: true, onChange: 'confirm' }),
    'verification.names-keep-for': setting.duration({ default: '365d', min: '0d', max: '800d', change, audience: 'public', quotable: true, onChange: 'confirm' }),
    'retention.ended-after': setting.duration({ default: '2190d', min: '365d', max: '3650d', change, audience: 'public', quotable: true, onChange: 'confirm' }),
    'ending.by-holder': setting.boolean({ default: true, change, audience: 'staff' }),
    'help.link': setting.text({ default: '', maxLength: 300, change, audience: 'public' }),
  }),
  settingRules: defineSettingRules('membership', [
    { id: 'reminders-in-order', check: s => (s['reminders.final'] as number) < (s['reminders.first'] as number) },
  ]),
  settingGroups: {
    retention: { advanced: true },
  },

  records: defineRecords('membership', {
    'scheme': { table: 'membership_schemes' },
    'membership': { table: 'membership_memberships', parent: 'membership.scheme', owner: 'account_id' },
    'verification-list': { table: 'membership_verification_lists' },
  }),
  // Abilities for verifying, changing, ending, exporting and importing memberships, and for lists and
  // cards, are declared with the slices that use them.
  abilities: defineAbilities('membership', {
    'scheme.view': ability({ on: 'membership.scheme', audit: false }),
    // Privileged: a scheme decides who gets the members' area.
    'scheme.manage': ability({ on: 'membership.scheme', risk: 'privileged', implies: ['scheme.view'] }),
    'membership.view': ability({ on: 'membership.membership', owner: 'grants', audit: 'read', implies: ['core.account.find'] }),
    'membership.add': ability({ on: 'membership.scheme', implies: ['membership.view'] }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  // Read from the state and the dates at each request (rule D1): nothing has to run for them to end.
  facts: defineFacts('membership', {
    'holder': factDecl({ standing: true }),
    'supporter': factDecl(),
    'scheme-holder': factDecl({ on: 'membership.scheme' }),
  }),

  tables,

  events: {
    announces: {
      // A scheme has no subject, so its events may leave the system.
      'membership.scheme.opened': event({ version: 1, payload: scheme, internal: false }),
      'membership.scheme.closed': event({ version: 1, payload: scheme, internal: false }),
      // Anything about a person's standing stays inside.
      'membership.membership.started': event({ version: 1, payload: membership, internal: true }),
    },
  },
})
