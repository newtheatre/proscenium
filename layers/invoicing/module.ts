// Invoices and exports (third round, spec 9). The gate (IE-01 to IE-06) is the exports half: export
// profiles that map Finance's accounts to another set of books' codes, the students' union return,
// and a record of every file taken. Invoices and bills follow; this file declares only what is built.
import { ability, defineAbilities, defineModule, defineRecords, defineSettings, event, setting } from '#kit'
import { z } from 'zod'
import { tables } from './server/db/schema'

const change = 'invoicing.settings.manage'

export default defineModule({
  id: 'invoicing',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  switchable: true,
  requires: ['finance', 'payments'],

  settings: defineSettings('invoicing', {
    // What the Exports screen opens on.
    'exports.default-profile': setting.reference({ record: 'invoicing.export-profile', change, audience: 'staff' }),
    // The profile made when the module is first switched on: the students' union preset makes the union's.
    'exports.starter': setting.choice({ default: 'journal', options: ['journal', 'union'], change, audience: 'staff' }),
  }),

  records: defineRecords('invoicing', {
    'export-profile': { table: 'invoicing_export_profiles' },
  }),
  abilities: defineAbilities('invoicing', {
    // Reads the whole ledger, so routes also check finance.ledger.view; every read is audited.
    'export.take': ability({ risk: 'privileged', fresh: false, audit: 'read' }),
    'export.manage': ability({ on: 'invoicing.export-profile', risk: 'privileged', implies: ['export.take'] }),
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  events: {
    announces: {
      'invoicing.export.taken': event({ version: 1, payload: z.object({ runId: z.string(), profileId: z.string() }), internal: false }),
    },
    listens: { 'core.module.enabled': 'starter-profile' },
  },

  contributes: {
    // Made when the module is switched on, for the invoices and bills that follow (part 2).
    'finance.system-account': [
      { id: 'receivable', name: 'Debtors', kind: 'asset' },
      { id: 'payable', name: 'Creditors', kind: 'liability' },
      { id: 'bad-debts', name: 'Bad debts', kind: 'expense' },
      { id: 'other-income', name: 'Other income', kind: 'income' },
      { id: 'general-expenses', name: 'General expenses', kind: 'expense' },
    ],
    'core.record-resolver': [{ id: 'invoicing.export-profile', file: 'export-profile' }],
    'core.navigation': [
      { id: 'invoicing.exports', menu: 'console', group: 'money', section: 'everyday', to: '/console/invoicing/exports', icon: 'i-lucide-file-spreadsheet', ability: 'invoicing.export.take', order: 90 },
      { id: 'invoicing.export-profiles', menu: 'admin', group: 'modules', to: '/admin/modules/invoicing/exports', icon: 'i-lucide-file-cog', ability: 'invoicing.export.manage', order: 30 },
    ],
  },

  presets: {
    'student-society': { on: true, settings: { 'invoicing.exports.starter': 'union' } },
  },
})
