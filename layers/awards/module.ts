// Awards: the honours a theatre gives and who holds them. A theatre defines its own award types (a
// fellowship, a commendation); an award is a permanent record that one person holds one type, with
// the committee's decision beside it. It never lapses and can only be revoked. A type may carry a
// ticket benefit, which Box office honours through core.requirement without learning what an award
// is. Awards requires no other module. This file grows with the build; it declares only what the
// code so far uses.
import { z } from 'zod'
import { ability, defineAbilities, defineFacts, defineModule, defineRecords, defineSettings, event, factDecl, job, setting } from '#kit'
import { tables } from './server/db/schema'

const change = 'awards.settings.manage'
const award = z.object({ awardId: z.string(), typeId: z.string() })

export default defineModule({
  id: 'awards',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  uses: ['forms', 'box-office', 'communications', 'public-site'],

  settings: defineSettings('awards', {
    // Whether the person is told by email when an award is issued to their account.
    'issuing.tell-recipient': setting.boolean({ default: true, change, audience: 'staff' }),
    // Whether the roll of honour is shown at /awards and through ::awards-roll.
    'roll.public': setting.boolean({ default: true, change, audience: 'public' }),
  }),

  records: defineRecords('awards', {
    type: { table: 'awards_types' },
    award: { table: 'awards_awards', parent: 'awards.type', owner: 'account_id' },
  }),
  abilities: defineAbilities('awards', {
    'type.view': ability({ on: 'awards.type', audit: false }),
    // Privileged: a type may give its holders a ticket price.
    'type.manage': ability({ on: 'awards.type', risk: 'privileged', implies: ['type.view'] }),
    'award.view': ability({ on: 'awards.award', owner: 'grants', audit: 'read', implies: ['type.view', 'core.account.find'] }),
    // Recording an award the committee has decided. Privileged: it may give free tickets. Nobody issues their own.
    'award.issue': ability({ on: 'awards.type', risk: 'privileged', implies: ['award.view'] }),
    // Correcting an award's wording, date or link. Nobody corrects their own.
    'award.update': ability({ on: 'awards.award', owner: 'refuses', implies: ['award.view'] }),
    // Taking an award back, with a reason. Nobody revokes their own.
    'award.revoke': ability({ on: 'awards.award', risk: 'privileged', owner: 'refuses', implies: ['award.view'] }),
    // Asking whether somebody else holds an award: a seller checking a fellow's ticket price, a
    // steward at the door. The requirement source's checkAbility.
    'award.check': ability({ on: 'awards.award', audit: 'read' }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  // Read from the award's state at each request: nothing has to run when one is revoked.
  facts: defineFacts('awards', {
    // A current award of one type ("fellows may book the studio"). Not a standing.
    'type-holder': factDecl({ on: 'awards.type' }),
  }),

  tables,

  contributes: {
    'core.navigation': [
      { id: 'awards.types', menu: 'admin', group: 'modules', to: '/admin/modules/awards/types', match: '/admin/modules/awards/types', icon: 'i-lucide-award', ability: 'awards.type.manage', order: 10 },
      { id: 'awards.awards', menu: 'console', group: 'people', section: 'everyday', to: '/console/awards', match: '/console/awards', icon: 'i-lucide-award', ability: 'awards.award.view', order: 40 },
      { id: 'awards.mine', menu: 'account', group: 'theatre', to: '/account/awards', icon: 'i-lucide-award', ability: 'signed-in', order: 37, count: 'awards.mine', hideEmpty: true },
    ],
    'core.notification-type': [{
      id: 'awards.awarded',
      category: 'transactional' as const,
      side: 'audience' as const,
      channels: ['email' as const, 'inbox' as const],
      variables: { award: 'text' as const, link: 'text' as const },
      link: '/account/awards',
      wording: {
        'en-GB': {
          subject: 'You have been awarded: {{ award }}',
          body: '{{ theatre }} has awarded you **{{ award }}**.\n\nSign in to see it, and to choose where it is listed on the roll of honour: [My awards]({{ link }})',
        },
      },
    }],
    'core.record-resolver': [
      { id: 'awards.type', file: 'type' },
      { id: 'awards.award', file: 'award' },
    ],
    // A person's awards, on their page in the console.
    'core.record-tab': [{ id: 'awards.account', record: 'core.account', ability: 'awards.award.view', component: 'AwardsAccountTab', order: 35 }],
    'core.account-section': [
      { id: 'awards.mine', target: 'account' as const, side: 'audience' as const, ability: 'signed-in', component: 'AwardsMine', order: 37, to: '/account/awards', icon: 'i-lucide-award', count: 'awards.mine', hideEmpty: true },
    ],
    // My account shows Awards only to somebody who holds one.
    'core.count': [{ id: 'awards.mine', file: 'mine' }],
    'core.account-notice': [{ id: 'awards.unlisted', file: 'unlisted' }],
    // An erased person's awards leave the roll in the erasure's own batch.
    'core.erasure-handler': [{ id: 'awards', file: 'awards' }],
    'core.requirement': [{ id: 'awards', file: 'awards' }],
    // Nominations: a published form attached to an award type, whose approval can issue the award.
    'forms.slot': [{ id: 'awards.nomination', subject: 'awards.type', attach: 'awards.type.manage', label: 'awards.forms.nomination.label', source: 'awards.type' }],
    'forms.source': [{ id: 'awards.type', file: 'type' }],
    'forms.outcome-action': [{ id: 'awards.issue-award', file: 'issue-award' }],
    'forms.template': [{ id: 'awards.nomination', file: 'nomination' }],
    // ::awards-roll in a theatre's own page.
    'core.public-component': [
      { id: 'awards-roll', component: 'AwardsRoll', alias: 'awards-roll', description: 'The roll of honour: everybody holding a listed award, by award type, or one type alone (type, its web address).' },
    ],
    // The holder's card, read by the door and the desk.
    'box-office.door-code': [{ id: 'awards.card', file: 'card' }],
    // The fellow's price: a ticket type Box office keeps for anyone holding a current award that
    // carries a ticket price, one ticket each, checked when bought. The theatre prices it per band.
    'box-office.ticket-type': [{ id: 'fellow', name: 'Fellow', kind: 'standard', requirementRefs: ['awards:benefit'], sort: 12 }],
  },

  jobs: {
    // A share of an awards import, on the bulk lane so a large file never holds up the prompt one.
    'awards.import-awards': job({
      payload: z.object({
        importId: z.string(),
        typeId: z.string(),
        importedBy: z.string().nullable(),
        rows: z.array(z.object({ line: z.number(), name: z.string(), awardedOn: z.string(), awardedPrecision: z.enum(['day', 'year']).optional(), awardedFor: z.string().nullable(), citation: z.string().nullable(), address: z.string().nullable() })),
      }),
      lane: 'bulk',
    }),
  },

  events: {
    announces: {
      // Anything about a person's award stays inside.
      'awards.award.issued': event({ version: 1, payload: award, internal: true }),
      'awards.award.revoked': event({ version: 1, payload: award, internal: true }),
    },
  },
})
