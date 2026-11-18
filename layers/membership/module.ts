// Membership (Membership specification): schemes and their lengths, memberships, the standing a
// members' scheme gives and the reference lists a scheme checks against. Free membership needs no
// money: fees are the separate membership-fees module. This file grows with the build; it declares
// only what the code so far uses.
//
// Forms is required, as the specification says: a scheme's application form and members' own
// fields are form slots. Forms is always on, so requiring it ties nothing to a switch.
import { z } from 'zod'
import { ability, credentialDecl, defineAbilities, defineFacts, defineModule, defineRecords, defineSettingRules, defineSettings, event, factDecl, job, point, setting, task } from '#kit'
import { tables } from './server/db/schema'

const change = 'membership.settings.manage'
const scheme = z.object({ schemeId: z.string() })
const membership = z.object({ membershipId: z.string(), schemeId: z.string(), accountId: z.string() })

export default defineModule({
  id: 'membership',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  requires: ['forms'],
  uses: ['communications', 'box-office', 'front-of-house'],

  settings: defineSettings('membership', {
    'applications.expire-after': setting.duration({ default: '14d', min: '1d', max: '90d', change, whenModule: 'membership-fees', audience: 'public', quotable: true }),
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
    // Filling in a membership's custom fields (MEM-34): the holder fills in their own, and staff who hold it fill in anybody's.
    'membership.fields': ability({ on: 'membership.membership', owner: 'grants', implies: ['membership.view'] }),
    // Exporting the members list (MEM-27): a file of people, so privileged.
    // Importing members from a file (MEM-49): a dry run, then bulk jobs. Privileged: it makes accounts.
    'membership.import': ability({ on: 'membership.scheme', risk: 'privileged', implies: ['membership.add'] }),
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
    // A voting scheme's members, after the qualifying period (MEM-09).
    'voter': factDecl(),
    'scheme-holder': factDecl({ on: 'membership.scheme' }),
  }),

  tables,

  points: {
    // The fee collector (rules S5, P1). The membership-fees module answers it; while nothing does,
    // a scheme that requires payment cannot be joined online.
    'membership.charge': point({ kind: 'code', contract: 'charge' }),
  },

  credentials: {
    // The key verification lists are hashed with (V10). Lists cannot be used until it is set. Typed
    // on Membership > Lists (Matt, 17 November), or set as a Worker secret of the same name. A new
    // key leaves every list already loaded unable to match, so the form asks first.
    MEMBERSHIP_LIST_KEY: credentialDecl({ needed: 'when-used', manage: 'membership.verification-list.manage', confirm: true }),
  },

  jobs: {
    // A share of a members import (MEM-49), on the bulk lane so a large file never holds up the prompt one.
    'membership.import-members': job({
      payload: z.object({
        importId: z.string(),
        schemeId: z.string(),
        importedBy: z.string().nullable(),
        day: z.string(),
        rows: z.array(z.object({ line: z.number(), address: z.string(), name: z.string().nullable(), startsOn: z.string().nullable(), endsOn: z.string().nullable() })),
      }),
      lane: 'bulk',
    }),
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
    // The application form a scheme asks applicants to answer (MEM-03, MEM-12); a decision stage on it is approval (AP1).
    'forms.slot': [
      { id: 'membership.application', subject: 'membership.scheme', attach: 'membership.scheme.manage', label: 'membership.forms.application.label', limit: 1 },
      // MEM-34: what a theatre keeps about its members, such as course and year, for every membership.
      { id: 'membership.member-fields', subject: 'membership.membership', attach: 'membership.scheme.manage', edit: 'membership.membership.fields', mode: 'record' as const, label: 'membership.forms.member-fields.label', limit: 1 },
    ],
    // Membership's lines of the privacy notice's "what we hold" table (/policies/privacy).
    'core.privacy-record': [
      { id: 'membership.memberships', holds: 'Your membership: its kind, its dates and your membership number', why: 'To run your membership', basis: 'To carry out our contract with you', keptFor: 'While you are a member', order: 150 },
      { id: 'membership.ended', holds: 'Memberships that have ended', why: 'To answer questions about past membership', basis: 'Our legitimate interests in keeping an accurate record of who our members were', keptFor: 'membership.retention.ended-after', order: 160 },
      { id: 'membership.verification-names', holds: 'Names on a membership list another organisation sent us', why: 'So that staff can resolve a mismatch', basis: 'Our legitimate interests in checking membership fairly', keptFor: 'membership.verification.names-keep-for', order: 170 },
    ],
    'core.navigation': [
      { id: 'membership.schemes', menu: 'admin', group: 'modules', to: '/admin/modules/membership/schemes', match: '/admin/modules/membership/schemes', icon: 'i-lucide-id-card', ability: 'membership.scheme.view', order: 10 },
      { id: 'membership.members', menu: 'console', group: 'membership', section: 'everyday', to: '/console/membership', match: '/console/membership/memberships', icon: 'i-lucide-users', ability: 'membership.membership.view', order: 1 },
      { id: 'membership.applications', menu: 'console', group: 'membership', section: 'everyday', to: '/console/membership/applications', match: '/console/membership/applications', icon: 'i-lucide-inbox', ability: 'membership.membership.view', order: 5, count: 'membership.applications-waiting' },
      { id: 'membership.lists', menu: 'admin', group: 'modules', to: '/admin/modules/membership/lists', match: '/admin/modules/membership/lists', icon: 'i-lucide-list-checks', ability: 'membership.verification-list.manage', order: 20 },
      { id: 'membership.mine', menu: 'account', group: 'theatre', to: '/account/membership', icon: 'i-lucide-id-card', ability: 'signed-in', order: 35, forNonMembers: true },
    ],
    // Renewal reminders (R7 to R9): service messages about something the person holds.
    'core.notification-type': [{
      // A new membership has started, by joining, an approved application, a paid fee or staff adding the person.
      id: 'membership.welcome',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      link: '/account/membership',
      variables: { scheme: 'text' as const, gives: 'text' as const, until: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Welcome to {{ scheme }}',
          body: 'Welcome. You are now a member of **{{ scheme }}** at {{ theatre }}.\n\n{{ gives }}\n\n{{ until }} Your membership card is in your account: show it on your phone whenever you are asked for it.',
          action: 'See my membership card',
        },
      },
    }, {
      // P9: staff added the person to a scheme that requires payment and chose to send a link.
      id: 'membership.pay-link',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      variables: { scheme: 'text' as const, amount: 'text' as const, link: 'text' as const },
      wording: {
        'en-GB': {
          subject: 'Pay for your membership: {{ scheme }}',
          body: 'The theatre has added you as a member of **{{ scheme }}**. Your membership starts once the fee of {{ amount }} is paid.\n\nSign in to pay: [Pay for my membership]({{ link }})',
        },
      },
    }, {
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
    // Members in the command palette, by name, address or number, shown by scheme and number (tab 4).
    'core.search-source': [{ id: 'membership.members', record: 'membership.membership', ability: 'membership.membership.view', route: '/api/membership/search', shells: ['console'] }],
    'core.record-resolver': [
      { id: 'membership.scheme', file: 'scheme' },
      { id: 'membership.membership', file: 'membership' },
      { id: 'membership.verification-list', file: 'verification-list' },
    ],
    // Setting up membership (MEM-45): the first scheme is required; a list only for a scheme that checks one.
    'core.setup-step': [
      { id: 'membership.first-scheme', required: true, to: '/admin/modules/membership/schemes', order: 40 },
      { id: 'membership.verification-list', required: false, to: '/admin/modules/membership/lists', order: 41 },
    ],
    // Applications waiting on staff: beside the Applications entry, and as a card on the console home.
    'core.count': [{ id: 'membership.applications-waiting', file: 'applications-waiting' }, { id: 'membership.cards-held', file: 'cards-held' }],
    'core.home-card': [
      { id: 'membership.applications', home: 'console', ability: 'membership.membership.view', component: 'MembershipApplicationsCard', urgency: 'today', count: 'membership.applications-waiting' },
      // The holder's own card, on the members' area home, while they hold a membership.
      { id: 'membership.card', home: 'members', ability: 'signed-in', component: 'MembershipCardHomeCard', urgency: 'info', count: 'membership.cards-held' },
    ],
    // A person's memberships, on their page in the console.
    'core.record-tab': [{ id: 'membership.account', record: 'core.account', ability: 'membership.membership.view', component: 'MembershipAccountTab', order: 30 }],
    'core.health-check': [
      { id: 'membership.applications-waiting', file: 'applications-waiting' },
      { id: 'membership.open-schemes', file: 'open-schemes' },
      { id: 'membership.reminders-ran', file: 'reminders-ran' },
    ],
    // A renewal that is open, kept in sight on My account's overview until it is done (R1).
    'core.account-notice': [{ id: 'membership.renewal-open', file: 'renewal-open' }],
    // The membership card: Box office signs it and its door reads it (MEM-51). Absent while Box office is off.
    // Ends live memberships in the erasure batch (X4); claimed list entries are let go and emptied.
    'core.erasure-handler': [{ id: 'membership', file: 'membership' }],
    // X2, X3: a duplicate open application is superseded before the memberships move.
    'core.merge-handler': [{ id: 'membership', file: 'membership' }],
    'box-office.door-code': [{ id: 'membership.card', file: 'card' }],
    // The member price: a ticket type Box office keeps for anyone with a current membership of any
    // scheme, checked when bought and again at the door. The theatre prices it per band.
    'box-office.ticket-type': [{ id: 'member', name: 'Member', kind: 'standard', requirementRefs: ['membership:any'], sort: 10 }],
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
    listens: {
      // AP2: approved or declined at the application form's decision stage.
      'forms.response.decided': 'application-decided',
    },
  },
})
