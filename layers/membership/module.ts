// Membership (Membership specification): schemes and their lengths, memberships, the standing a
// members' scheme gives and the reference lists a scheme checks against. Free membership needs no
// money: fees are the separate membership-fees module. This file grows with the build; it declares
// only what the code so far uses.
//
// The specification has `requires: ['forms']`. The form builder is not built yet, and the gate
// needs no form (tab 7), so forms is only used until the application form is wired in.
import { z } from 'zod'
import { ability, defineAbilities, defineFacts, defineModule, defineRecords, defineSettingRules, defineSettings, event, factDecl, secret, setting, task } from '#kit'
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
    // Passing or declining an application waiting on a check (V3). Nobody checks their own.
    'membership.verify': ability({ on: 'membership.membership', owner: 'refuses', implies: ['membership.view'] }),
    // Ending a membership (tab 4, "Ending"). A holder ends their own through My membership instead.
    'membership.end': ability({ on: 'membership.membership', implies: ['membership.view'] }),
    'membership.add': ability({ on: 'membership.scheme', implies: ['membership.view'] }),
    // Correcting a membership's dates (D7, MEM-28). Nobody corrects their own.
    'membership.update': ability({ on: 'membership.membership', owner: 'refuses', implies: ['membership.view'] }),
    // Exporting the members list (MEM-27): a file of people, so privileged.
    'membership.export': ability({ risk: 'privileged', implies: ['membership.view'] }),
    // Asking whether somebody else holds a membership: a seller checking a customer's member price,
    // a steward at the door. The requirement source's checkAbility.
    'card.check': ability({ on: 'membership.membership', audit: 'read' }),
    // Loading, adding to and removing from verification lists (V19). Never shows a list.
    'verification-list.manage': ability({ on: 'membership.verification-list', risk: 'privileged', implies: ['verification-list.check'] }),
    // Seeing the name behind a ticket bought by reference, through requirements.holder (V18, V19).
    'verification-list.check': ability({ on: 'membership.verification-list', audit: 'read' }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  // Read from the state and the dates at each request (rule D1): nothing has to run for them to end.
  facts: defineFacts('membership', {
    'holder': factDecl({ standing: true }),
    'supporter': factDecl(),
    'scheme-holder': factDecl({ on: 'membership.scheme' }),
  }),

  tables,

  secrets: {
    // The key verification lists are hashed with (V10). Lists cannot be used until it is set.
    MEMBERSHIP_LIST_KEY: secret({ needed: 'when-used' }),
  },

  tasks: {
    // Names on list entries kept long enough after their end (V18), and entries past their list's
    // date or membership.verification.list-keep-for.
    'membership.sweep-lists': task({ dailyAt: '03:40' }),
    // Renewal is open, the last reminder, and lapsed (R8).
    'membership.send-reminders': task({ dailyAt: '09:00' }),
    // Applications not finished in time (J5).
    'membership.expire-applications': task({ dailyAt: '03:30' }),
    // Free text on memberships past membership.retention.ended-after.
    'membership.sweep-memberships': task({ dailyAt: '03:50' }),
  },

  contributes: {
    'core.navigation': [
      { id: 'membership.schemes', menu: 'console', group: 'membership', section: 'setup', to: '/console/membership/schemes', match: '/console/membership/schemes', icon: 'i-lucide-id-card', ability: 'membership.scheme.view', order: 10 },
      { id: 'membership.members', menu: 'console', group: 'membership', section: 'everyday', to: '/console/membership', match: '/console/membership/memberships', icon: 'i-lucide-users', ability: 'membership.membership.view', order: 1 },
      { id: 'membership.applications', menu: 'console', group: 'membership', section: 'everyday', to: '/console/membership/applications', match: '/console/membership/applications', icon: 'i-lucide-inbox', ability: 'membership.membership.view', order: 5 },
      { id: 'membership.lists', menu: 'console', group: 'membership', section: 'setup', to: '/console/membership/lists', match: '/console/membership/lists', icon: 'i-lucide-list-checks', ability: 'membership.verification-list.manage', order: 20 },
      { id: 'membership.mine', menu: 'account', group: 'theatre', to: '/account/membership', icon: 'i-lucide-id-card', ability: 'signed-in', order: 35 },
    ],
    // Renewal reminders (R7 to R9): service messages about something the person holds.
    'core.notification-type': [{
      id: 'membership.renewal-open',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      variables: { scheme: 'text' as const, ends: 'text' as const, link: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'You can now renew: {{ scheme }}',
          body: 'Your membership, **{{ scheme }}**, ends on {{ ends }}. You can renew it now, and the new one starts the day after.\n\n[Renew my membership]({{ link }})',
        },
      },
    }, {
      id: 'membership.renewal-final',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      variables: { scheme: 'text' as const, ends: 'text' as const, link: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your membership ends soon: {{ scheme }}',
          body: 'Your membership, **{{ scheme }}**, ends on {{ ends }}. Renew it to keep it going without a gap.\n\n[Renew my membership]({{ link }})',
        },
      },
    }, {
      id: 'membership.lapsed',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      variables: { scheme: 'text' as const, ends: 'text' as const, link: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Your membership has ended: {{ scheme }}',
          body: 'Your membership, **{{ scheme }}**, ended on {{ ends }}. You can join again at any time.\n\n[See memberships]({{ link }})',
        },
      },
    }],
    // On the audience side, so anyone can find how to join.
    'core.requirement': [{ id: 'membership', file: 'membership' }],
    // A renewal that is open, kept in sight on My account's overview until it is done (R1).
    'core.account-notice': [{ id: 'membership.renewal-open', file: 'renewal-open' }],
    // The membership card: Box office signs it and its door reads it (MEM-51). Absent while Box office is off.
    // Ends live memberships in the erasure batch (X4); claimed list entries are let go and emptied.
    'core.erasure-handler': [{ id: 'membership', file: 'membership' }],
    'box-office.door-code': [{ id: 'membership.card', file: 'card' }],
    'core.account-section': [
      { id: 'membership.mine', target: 'account' as const, side: 'audience' as const, ability: 'signed-in', component: 'MembershipMine', order: 35, to: '/account/membership', icon: 'i-lucide-id-card' },
    ],
  },

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
