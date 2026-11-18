// The form builder (form builder specification): a theatre's own questions anywhere in the platform,
// with logic, versions and, where a form wants one, a workflow. Always on, as the specification
// decides. This file grows with the build; it declares only what the code so far uses.
import { ability, defineAbilities, defineModule, defineRecords, defineSettings, setting } from '#kit'
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
  }),
  abilities: defineAbilities('forms', {
    'form.create': ability(),
    // The draft saves itself as the author works, so each save is not an audit entry; a change to
    // the form's own fields is, and so is every publish.
    'form.edit': ability({ on: 'forms.form', owner: 'grants', audit: false }),
    'form.publish': ability({ on: 'forms.form', implies: ['form.edit'] }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  contributes: {
    'core.record-resolver': [{ id: 'forms.form', file: 'form' }],
    'core.navigation': [
      { id: 'forms.forms', menu: 'console', group: 'forms', section: 'everyday', to: '/console/forms', match: '/console/forms', icon: 'i-lucide-file-text', ability: ['forms.form.create', 'forms.form.edit'], order: 1 },
    ],
  },
})
