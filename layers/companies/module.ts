// Companies (third round, spec 3; docs/specs/companies): visiting companies, acts and hirers, from a
// first enquiry to a settled account. The gate declares the module whole (CO-01); the routes, the fact
// and the moves so far are companies, contacts and engagements. Later slices add to this file.
import { z } from 'zod'
import { ability, defineAbilities, defineFacts, defineModule, defineRecords, defineSettings, event, factDecl, point, setting } from '#kit'
import { tables } from './server/db/schema'
import { ENGAGEMENT_STATES } from './shared/companies'

const change = 'companies.settings.manage'
const engagementMoved = z.object({ engagementId: z.string(), from: z.enum(ENGAGEMENT_STATES).nullable(), to: z.enum(ENGAGEMENT_STATES) })

export default defineModule({
  id: 'companies',
  manifest: 1,
  since: '0.1.0',
  stability: 'experimental',
  switchable: true,
  requires: ['finance', 'payments'],

  // Part 6. Every number is a proposed default for the workshops (part 9, Q6).
  settings: defineSettings('companies', {
    'agreements.required': setting.boolean({ default: false, change, audience: 'staff' }),
    'agreements.default-clauses': setting.text({ unset: true, maxLength: 20000, multiline: true, change, audience: 'staff' }),
    'guests.default-places': setting.integer({ default: 2, min: 0, max: 50, change, audience: 'staff' }),
    'guests.names-due': setting.duration({ default: '24h', min: '1h', max: '14d', change, audience: 'signed-in' }),
    'guests.remind-before': setting.duration({ default: '48h', min: '0m', max: '14d', change, audience: 'staff' }),
    'guests.keep-unnamed': setting.boolean({ default: false, change, audience: 'staff' }),
    'settlements.due-within': setting.duration({ default: '14d', min: '1d', max: '90d', change, audience: 'signed-in' }),
    'settlements.approve-without-agreement': setting.duration({ default: '14d', min: '1d', max: '60d', change, audience: 'signed-in' }),
    'contacts.keep-for': setting.duration({ default: '730d', min: '90d', max: '2190d', change, audience: 'staff', onChange: 'confirm' }),
    'people.keep-for': setting.duration({ default: '90d', min: '7d', max: '730d', change, audience: 'staff' }),
    'merges.undo-for': setting.duration({ default: '30d', min: '1d', max: '90d', change, audience: 'staff' }),
  }),

  records: defineRecords('companies', {
    company: { table: 'companies_companies' },
    contact: { table: 'companies_contacts', parent: 'companies.company', owner: 'account_id' },
    engagement: { table: 'companies_engagements', parent: 'companies.company' },
    agreement: { table: 'companies_agreements', parent: 'companies.engagement', owner: 'created_by' },
    allocation: { table: 'companies_allocations', parent: 'companies.engagement' },
    settlement: { table: 'companies_settlements', parent: 'companies.engagement', owner: 'prepared_by' },
  }),

  // Part 6. Declared as the routes that need them land: the gate's, so far; part 6 lists all twenty.
  abilities: defineAbilities('companies', {
    'company.view': ability({ on: 'companies.company', audit: false }),
    'company.manage': ability({ on: 'companies.company', implies: ['company.view', 'core.account.find'] }),
    'contact.manage': ability({ on: 'companies.company', implies: ['company.view'] }),
    'engagement.view': ability({ on: 'companies.engagement', implies: ['company.view'] }),
    'engagement.manage': ability({ on: 'companies.engagement', implies: ['engagement.view'] }),
    'allocation.manage': ability({ on: 'companies.engagement', implies: ['engagement.view'] }),
    'settlement.view': ability({ on: 'companies.engagement', implies: ['engagement.view'] }),
    'settlement.approve': ability({ on: 'companies.settlement', risk: 'privileged', owner: 'refuses', implies: ['settlement.view'] }),
    'settings.manage': ability({ risk: 'privileged' }),
    'engagement.view-own': ability({ on: 'companies.engagement', audit: false }),
    'guest.name': ability({ on: 'companies.engagement', implies: ['engagement.view-own'] }),
  }),

  // Part 4, "Fact": read live from the contacts table, so ending a contact ends their access at once (CO-05).
  facts: defineFacts('companies', {
    'contact-of': factDecl({
      on: 'companies.engagement',
      defaults: ['companies.engagement.view-own', 'companies.guest.name'],
    }),
  }),

  tables,

  points: {
    // BO-75: the selling module that issues a company's guests their tickets (part 4).
    'companies.guest-issuer': point({ kind: 'code', contract: 'guest-issuer' }),
  },

  events: {
    announces: {
      'companies.contact.changed': event({ version: 1, payload: z.object({ companyId: z.string(), contactId: z.string() }), internal: true }),
      'companies.engagement.changed': event({ version: 1, payload: engagementMoved, internal: false }),
      'companies.settlement.approved': event({ version: 1, payload: z.object({ settlementId: z.string(), engagementId: z.string() }), internal: false }),
    },
  },

  contributes: {
    // Part 2, "Ledger accounts": made locked when the module is switched on.
    'finance.system-account': [
      { id: 'company-share', name: 'Company shares', kind: 'expense' },
      { id: 'payable', name: 'Owed to companies', kind: 'liability' },
      { id: 'receivable', name: 'Owed by companies and hirers', kind: 'asset' },
      { id: 'hire-income', name: 'Hire income', kind: 'income' },
      { id: 'deposits-held', name: 'Hire deposits held', kind: 'liability' },
      { id: 'other-income', name: 'Other company income', kind: 'income' },
      { id: 'paid-out', name: 'Paid out to companies', kind: 'asset' },
    ],
    'core.record-resolver': [
      { id: 'companies.company', file: 'company' },
      { id: 'companies.engagement', file: 'engagement' },
      { id: 'companies.settlement', file: 'settlement' },
    ],
  },

  presets: {
    'student-society': { on: false },
    'small-venue': { on: true, settings: { 'companies.agreements.required': true } },
    'amateur-company': { on: true },
  },
})
