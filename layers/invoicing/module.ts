// Invoices and exports (third round, spec 9). Exports (IE-01 to IE-06): profiles that map Finance's
// accounts to another set of books' codes, the students' union return, and every file taken. Invoices
// out (IE-07 to IE-09, IE-13, IE-14, IE-31): series, drafts, issue and payments received. Bills follow.
import { ability, code, defineAbilities, defineModule, defineRecords, defineSettings, event, setting } from '#kit'
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
    // Days from issue to due, where the party has none of its own.
    'terms.days': setting.integer({ default: 30, min: 0, max: 120, change, audience: 'staff' }),
    // How far before today an issue date may be set (I-08).
    'issue.backdate-limit': setting.duration({ default: '30d', min: '0d', max: '365d', change, audience: 'staff' }),
    // An invoice above this needs someone other than its creator to issue it (I-09); unset, anyone may.
    'issue.second-person-over': setting.money({ unset: true, min: 100, max: 100000000, change, audience: 'staff' }),
    // Printed on every invoice for a bank transfer. Not a secret.
    'pay.bank-details': setting.text({ unset: true, maxLength: 400, multiline: true, change, audience: 'staff' }),
    // How long an issued invoice keeps its party's details after the end of its finance year.
    'records.keep-for': setting.duration({ default: '2192d', min: '2192d', max: '3653d', change, audience: 'staff', onChange: 'confirm' }),
  }),

  records: defineRecords('invoicing', {
    'export-profile': { table: 'invoicing_export_profiles' },
    'invoice': { table: 'invoicing_invoices' },
    'party': { table: 'invoicing_parties' },
    'series': { table: 'invoicing_series' },
  }),
  abilities: defineAbilities('invoicing', {
    // Reads the whole ledger, so routes also check finance.ledger.view; every read is audited.
    'export.take': ability({ risk: 'privileged', fresh: false, audit: 'read' }),
    'export.manage': ability({ on: 'invoicing.export-profile', risk: 'privileged', implies: ['export.take'] }),
    'settings.manage': ability({ risk: 'privileged' }),
    // Invoices and credit notes out and who owes what; every read is audited, as bill-to details are personal.
    'invoice.view': ability({ on: 'invoicing.invoice', fresh: false, audit: 'read' }),
    'invoice.draft': ability({ implies: ['invoice.view'] }),
    // Numbers, posts and sends; above issue.second-person-over, never one's own draft (I-09).
    'invoice.issue': ability({ on: 'invoicing.invoice', risk: 'privileged', implies: ['invoice.draft'] }),
    // A bank transfer or cheque received, through Payments' office channel (I-21).
    'payment.record': ability({ on: 'invoicing.invoice', risk: 'privileged', implies: ['invoice.view'] }),
  }),

  tables,

  events: {
    announces: {
      'invoicing.export.taken': event({ version: 1, payload: z.object({ runId: z.string(), profileId: z.string() }), internal: false }),
      'invoicing.invoice.issued': event({ version: 1, payload: z.object({ invoiceId: z.string(), kind: z.enum(['invoice', 'credit_note']), totalMinor: z.number().int() }), internal: false }),
      // Nothing left outstanding (I-23), carrying the source record so an owner can update its own.
      'invoicing.invoice.paid': event({ version: 1, payload: z.object({ invoiceId: z.string(), sourceModule: code().nullable(), sourceType: code().nullable(), sourceId: z.string().nullable() }), internal: false }),
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
    'core.record-resolver': [{ id: 'invoicing.export-profile', file: 'export-profile' }, { id: 'invoicing.invoice', file: 'invoice' }, { id: 'invoicing.series', file: 'series' }],
    // Money received against an invoice: the receivable is credited and the payment allocated (I-20, I-21).
    'payments.settlement': [{ id: 'invoicing' }],
    'core.navigation': [
      { id: 'invoicing.invoices', menu: 'console', group: 'money', section: 'everyday', to: '/console/invoicing/invoices', icon: 'i-lucide-receipt-text', ability: 'invoicing.invoice.view', order: 88 },
      { id: 'invoicing.series', menu: 'admin', group: 'modules', to: '/admin/modules/invoicing/series', icon: 'i-lucide-list-ordered', ability: 'invoicing.settings.manage', order: 31 },
      { id: 'invoicing.exports', menu: 'console', group: 'money', section: 'everyday', to: '/console/invoicing/exports', icon: 'i-lucide-file-spreadsheet', ability: 'invoicing.export.take', order: 90 },
      { id: 'invoicing.export-profiles', menu: 'admin', group: 'modules', to: '/admin/modules/invoicing/exports', icon: 'i-lucide-file-cog', ability: 'invoicing.export.manage', order: 30 },
    ],
  },

  presets: {
    'student-society': { on: true, settings: { 'invoicing.exports.starter': 'union' } },
  },
})
