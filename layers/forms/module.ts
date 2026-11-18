// The form builder (form builder specification): a theatre's own questions anywhere in the platform,
// with logic, versions and, where a form wants one, a workflow. Always on, as the specification
// decides. This file grows with the build; it declares only what the code so far uses.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineRecords, defineSettings, event, setting } from '#kit'
import { STAGE_KINDS } from './shared/engine/types'
import { tables } from './server/db/schema'

const change = 'forms.settings.manage'

export default defineModule({
  id: 'forms',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  switchable: false,

  settings: defineSettings('forms', {
    'limits.questions-per-form': setting.integer({ default: 200, min: 1, max: 500, change, audience: 'staff' }),
    'limits.pages-per-form': setting.integer({ default: 30, min: 1, max: 100, change, audience: 'staff' }),
    // Kilobytes. Kept well under D1's 2 MB row.
    'limits.definition-size': setting.integer({ default: 256, min: 32, max: 1024, change, audience: 'staff' }),
    'limits.repeat-entries': setting.integer({ default: 20, min: 1, max: 100, change, audience: 'staff' }),
    'limits.condition-depth': setting.integer({ default: 3, min: 1, max: 5, change, audience: 'staff' }),
    // Kilobytes. The most one person's answers may come to, sent or kept as a working copy.
    'limits.response-size': setting.integer({ default: 256, min: 16, max: 1024, change, audience: 'staff' }),
    // The most responses one export holds.
    'limits.export-rows': setting.integer({ default: 5000, min: 100, max: 20000, change, audience: 'staff' }),
    // Whether authors may write their own validation patterns (regular expressions).
    'builder.free-patterns': setting.boolean({ default: false, change, audience: 'staff' }),
    // Whether a form holding personal answers must say how long they are kept before it is published.
    'retention.require-choice': setting.boolean({ default: true, change, audience: 'staff' }),
  }),
  settingGroups: {
    limits: { advanced: true },
  },

  records: defineRecords('forms', {
    form: { table: 'forms_forms', owner: 'created_by' },
    response: { table: 'forms_responses', owner: 'person_id' },
  }),
  abilities: defineAbilities('forms', {
    'form.create': ability(),
    // The draft saves itself as the author works, so each save is not an audit entry; a change to
    // the form's own fields is, and so is every publish.
    'form.edit': ability({ on: 'forms.form', owner: 'grants', audit: false }),
    'form.publish': ability({ on: 'forms.form', implies: ['form.edit'] }),
    // Responses are read form by form: these are granted on the form, never on one response.
    'response.read': ability({ on: 'forms.form', owner: 'grants', audit: false }),
    // Moving a response between its form's stages; never one's own response (a guard in the service).
    'response.move': ability({ on: 'forms.form', owner: 'grants', implies: ['response.read'] }),
    // Approving or declining, and releasing a round of reviews to its panel (FB-405, FB-407).
    'response.decide': ability({ on: 'forms.form', owner: 'grants', implies: ['response.move'] }),
    'response.export': ability({ on: 'forms.form', risk: 'privileged', implies: ['response.read'] }),
    // Opening special-category answers. Every reveal is recorded.
    'response.read-special': ability({ on: 'forms.form', risk: 'privileged', audit: 'read', implies: ['response.read'] }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  events: {
    announces: {
      // Ids only: what was answered stays inside, and a listener reads it through forms.
      'forms.response.submitted': event({ version: 1, payload: z.object({ responseId: z.string(), formId: z.string() }), internal: true }),
      'forms.response.moved': event({ version: 1, payload: z.object({ responseId: z.string(), formId: z.string(), kind: z.enum(STAGE_KINDS), revision: z.number() }), internal: true }),
    },
  },

  contributes: {
    'core.record-resolver': [{ id: 'forms.form', file: 'form' }, { id: 'forms.response', file: 'response' }],
    'core.erasure-handler': [{ id: 'forms', file: 'answers' }],
    'core.account-section': [
      { id: 'forms.mine', target: 'account' as const, side: 'audience' as const, ability: 'signed-in', component: 'FormsMine', order: 45, to: '/account/forms', icon: 'i-lucide-file-text', count: 'forms.mine', hideEmpty: true },
    ],
    'core.count': [{ id: 'forms.mine', file: 'mine' }],
    'core.navigation': [
      { id: 'forms.forms', menu: 'console', group: 'forms', section: 'everyday', to: '/console/forms', match: '/console/forms', icon: 'i-lucide-file-text', ability: ['forms.form.create', 'forms.form.edit', 'forms.response.read'], order: 1 },
      // What a person has started or sent, in their account; shown once they have one.
      { id: 'forms.mine', menu: 'account', group: 'theatre', to: '/account/forms', match: '/account/forms', icon: 'i-lucide-file-text', ability: 'signed-in', order: 45, count: 'forms.mine', hideEmpty: true },
    ],
  },
})
