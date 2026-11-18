// The form builder (form builder specification): a theatre's own questions anywhere in the platform,
// with logic, versions and, where a form wants one, a workflow. Always on, as the specification
// decides. This file grows with the build; it declares only what the code so far uses.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineRecords, defineSettings, event, job, point, setting, task } from '#kit'
import { STAGE_KINDS } from './shared/engine/types'
import { tables } from './server/db/schema'

const change = 'forms.settings.manage'
const text = 'text' as const
const notice = { category: 'transactional' as const, side: 'audience' as const, channels: ['email' as const, 'inbox' as const] }

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
    // The most files one response may hold across its file questions. Each file's size is core's document limit.
    'limits.files-per-response': setting.integer({ default: 20, min: 1, max: 100, change, audience: 'staff' }),
    // Whether authors may write their own validation patterns (regular expressions).
    'builder.free-patterns': setting.boolean({ default: false, change, audience: 'staff' }),
    // Whether a form holding personal answers must say how long they are kept before it is published.
    'retention.require-choice': setting.boolean({ default: true, change, audience: 'staff' }),
    // Reminders. Each is a length of time, and nought sends none of that kind.
    // How long an unfinished working copy sits untouched before its person is reminded, once.
    'reminders.unfinished': setting.duration({ default: '7d', min: '0m', max: '60d', change, audience: 'staff' }),
    // How long before a form closes a person with unfinished answers to it is reminded, once.
    'reminders.closing': setting.duration({ default: '3d', min: '0m', max: '30d', change, audience: 'staff' }),
    // How long a response returned for changes waits before its person is reminded, once each time it is returned.
    'reminders.returned': setting.duration({ default: '7d', min: '0m', max: '60d', change, audience: 'staff' }),
    // How long a review in an open round may be outstanding before the reviewer is reminded, once.
    'reminders.review': setting.duration({ default: '7d', min: '0m', max: '60d', change, audience: 'staff' }),
    // How long the emailed link for sending changes works, for somebody who answered signed out (R-19).
    'changes.link-lifetime': setting.duration({ default: '30d', min: '1d', max: '90d', change, audience: 'staff' }),
  }),
  settingGroups: {
    limits: { advanced: true },
  },

  records: defineRecords('forms', {
    form: { table: 'forms_forms', owner: 'created_by' },
    response: { table: 'forms_responses', owner: 'person_id' },
    template: { table: 'forms_templates' },
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
    // Saving a form as a template the whole theatre can start from, and removing one.
    'template.manage': ability(),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  points: {
    // Somewhere a "record from a source" question chooses from: search, labels, and who may look.
    'forms.source': point({ kind: 'code', contract: 'source' }),
    // A place on another module's record where a form can be attached, such as a nomination for an award.
    'forms.slot': point({
      kind: 'data',
      schema: z.object({
        id: z.string(),
        // The record type a response there is about, and the ability needed on the record to attach a form.
        subject: z.string(),
        attach: z.string(),
        label: z.string(),
        limit: z.number().int().min(1).optional(),
        // A forms.source that names the subject's records.
        source: z.string().optional(),
        // Custom fields: a form attached for every record of the type, filled in on each record's page by whoever holds `edit` on it.
        mode: z.enum(['submission', 'record']).optional(),
        edit: z.string().optional(),
      }),
    }),
    // Something a module does once a response has taken a move, such as issuing the award.
    'forms.outcome-action': point({ kind: 'code', contract: 'outcome-action' }),
    // A ready-made form a module ships, such as a nomination for an award: offered in New form, and first where its slot is filled.
    'forms.template': point({ kind: 'code', contract: 'template' }),
  },

  jobs: {
    'forms.run-action': job({ payload: z.object({ runId: z.string() }) }),
  },

  tasks: {
    // Anonymises responses once the period their form keeps them for is up.
    'forms.sweep-retention': task({ dailyAt: '04:50' }),
    // Reminds people of unfinished and returned responses, and reviewers of reviews still owed.
    'forms.send-reminders': task({ dailyAt: '09:30' }),
  },

  events: {
    announces: {
      // Ids only: what was answered stays inside, and a listener reads it through forms.
      'forms.response.submitted': event({ version: 1, payload: z.object({ responseId: z.string(), formId: z.string() }), internal: true }),
      // A form stopped taking responses. Not internal: nothing here says who answered.
      'forms.form.closed': event({ version: 1, payload: z.object({ formId: z.string() }) }),
      // A response reached an approved or declined stage.
      'forms.response.decided': event({ version: 1, payload: z.object({ responseId: z.string(), formId: z.string(), outcome: z.enum(['approved', 'declined']) }), internal: true }),
      'forms.response.moved': event({ version: 1, payload: z.object({ responseId: z.string(), formId: z.string(), kind: z.enum(STAGE_KINDS), revision: z.number() }), internal: true }),
    },
  },

  contributes: {
    'core.record-resolver': [{ id: 'forms.form', file: 'form' }, { id: 'forms.response', file: 'response' }, { id: 'forms.template', file: 'template' }],
    'core.erasure-handler': [{ id: 'forms', file: 'answers' }],
    // File answers: held in core's store under their response, checked as any upload is, and read only
    // by those forms lets read the response. Uploaded through forms' own route while answering, never core's.
    'core.file-slot': [{ id: 'forms.answer-file', owner: 'forms.response', ability: 'forms.settings.manage', many: true, accepts: ['png' as const, 'jpeg' as const, 'webp' as const, 'pdf' as const], limit: 'core.files.document-limit', access: 'record' as const, textClass: 'personal' as const, clean: true }],
    'core.file-access': [{ id: 'forms.response', file: 'response' }],
    // Core contributes to no module's point, so the sources for core's records are forms' own.
    'forms.source': [
      { id: 'forms.person', file: 'person' }, { id: 'forms.production', file: 'production' }, { id: 'forms.performance', file: 'performance' },
      { id: 'forms.venue', file: 'venue' }, { id: 'forms.space', file: 'space' },
    ],
    'core.account-section': [
      { id: 'forms.mine', target: 'account' as const, side: 'audience' as const, ability: 'signed-in', component: 'FormsMine', order: 45, to: '/account/forms', icon: 'i-lucide-file-text', count: 'forms.mine', hideEmpty: true },
    ],
    'core.count': [{ id: 'forms.mine', file: 'mine' }],
    // What forms tells people. Nothing anybody wrote is in a message: it says what happened and where to read the rest.
    'core.notification-type': [
      {
        id: 'forms.received', ...notice, variables: { form: text, reference: text, link: text }, link: '/account/forms',
        wording: { 'en-GB': { subject: 'We have your response: {{ form }}', body: '{{ theatre }} has received your response to **{{ form }}**. Your reference is {{ reference }}.\n\n[See what you sent]({{ link }})' } },
      },
      {
        id: 'forms.received-guest', ...notice, channels: ['email' as const], variables: { form: text, reference: text },
        wording: { 'en-GB': { subject: 'We have your response: {{ form }}', body: '{{ theatre }} has received your response to **{{ form }}**. Your reference is {{ reference }}. Quote it if you get in touch about your response.' } },
      },
      {
        id: 'forms.returned', ...notice, variables: { form: text, reference: text, status: text, link: text }, link: '/account/forms',
        wording: { 'en-GB': { subject: 'Changes needed: {{ form }}', body: '{{ theatre }} has sent your response to **{{ form }}** ({{ reference }}) back to you for changes.\n\n[See what is asked and make your changes]({{ link }})' } },
      },
      {
        id: 'forms.status', ...notice, variables: { form: text, reference: text, status: text, link: text }, link: '/account/forms',
        wording: { 'en-GB': { subject: '{{ status }}: {{ form }}', body: 'Your response to **{{ form }}** ({{ reference }}) is now: **{{ status }}**.\n\n[See your response]({{ link }})' } },
      },
      {
        // Somebody who answered signed out is sent a fresh single-use link with each return (R-19).
        id: 'forms.returned-guest', ...notice, channels: ['email' as const], variables: { form: text, reference: text, link: 'sealed' as const },
        wording: { 'en-GB': { subject: 'Changes needed: {{ form }}', body: '{{ theatre }} has sent your response to **{{ form }}** ({{ reference }}) back to you for changes.\n\n[See what is asked and make your changes]({{ link }})\n\nThe link is yours alone: do not pass it on. It works once, for sending your changes.' } },
      },
      {
        id: 'forms.status-guest', ...notice, channels: ['email' as const], variables: { form: text, reference: text, status: text },
        wording: { 'en-GB': { subject: '{{ status }}: {{ form }}', body: 'Your response to **{{ form }}** ({{ reference }}) is now: **{{ status }}**.\n\nIf you have a question about it, reply to {{ theatre }} and quote your reference.' } },
      },
      {
        id: 'forms.review-requested', ...notice, variables: { form: text, link: text }, link: '/account/forms',
        wording: { 'en-GB': { subject: 'A response to review: {{ form }}', body: 'You have been asked to review a response to **{{ form }}**.\n\n[Open it and give your review]({{ link }})' } },
      },
      // Reminders (forms.send-reminders): each goes once, and none once the thing it is about is done.
      {
        id: 'forms.unfinished-reminder', ...notice, variables: { form: text, link: text }, link: '/account/forms',
        wording: { 'en-GB': { subject: 'Not finished yet: {{ form }}', body: 'You started answering **{{ form }}** but have not sent your answers yet. What you have written so far is kept.\n\n[Carry on where you left off]({{ link }})' } },
      },
      {
        id: 'forms.closing-reminder', ...notice, variables: { form: text, closes: text, link: text }, link: '/account/forms',
        wording: { 'en-GB': { subject: 'Closing soon: {{ form }}', body: '**{{ form }}** closes on {{ closes }}, and your answers have not been sent yet.\n\n[Finish and send them]({{ link }})' } },
      },
      {
        id: 'forms.returned-reminder', ...notice, variables: { form: text, reference: text, link: text }, link: '/account/forms',
        wording: { 'en-GB': { subject: 'Still waiting for your changes: {{ form }}', body: 'Your response to **{{ form }}** ({{ reference }}) is still back with you for changes.\n\n[See what is asked and make your changes]({{ link }})' } },
      },
      {
        id: 'forms.returned-reminder-guest', ...notice, channels: ['email' as const], variables: { form: text, reference: text, link: 'sealed' as const },
        wording: { 'en-GB': { subject: 'Still waiting for your changes: {{ form }}', body: 'Your response to **{{ form }}** ({{ reference }}) is still back with you for changes.\n\n[See what is asked and make your changes]({{ link }})\n\nThis link replaces the one we sent before, which no longer works. It is yours alone: do not pass it on.' } },
      },
      {
        id: 'forms.review-reminder', ...notice, variables: { form: text, link: text }, link: '/account/forms',
        wording: { 'en-GB': { subject: 'A review still to give: {{ form }}', body: 'A response to **{{ form }}** is still waiting for your review.\n\n[Open it and give your review]({{ link }})' } },
      },
    ],
    'core.navigation': [
      { id: 'forms.forms', menu: 'console', group: 'forms', section: 'everyday', to: '/console/forms', match: '/console/forms', icon: 'i-lucide-file-text', ability: ['forms.form.create', 'forms.form.edit', 'forms.response.read'], order: 1 },
      // What a person has started or sent, in their account; shown once they have one.
      { id: 'forms.mine', menu: 'account', group: 'theatre', to: '/account/forms', match: '/account/forms', icon: 'i-lucide-file-text', ability: 'signed-in', order: 45, count: 'forms.mine', hideEmpty: true },
    ],
  },
})
