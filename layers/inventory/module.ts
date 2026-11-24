// Inventory (module `inventory`): the theatre's props, costume, set and technical kit, where each
// thing is, who has it, whether it is safe, and when it leaves (docs/specs/inventory). Staff read
// "Inventory"; members read "Borrow kit". This file grows with the build.
import { z } from 'zod'
import { ability, defineAbilities, defineModule, defineRecords, defineSettings, event, setting } from '#kit'
import { tables } from './server/db/schema'

const change = 'inventory.settings.manage'
const loan = z.object({ loanId: z.string(), departmentId: z.string() })

export default defineModule({
  id: 'inventory',
  manifest: 1,
  since: '0.5.0',
  stability: 'experimental',

  // Part 6. One theatre, one policy: nothing here varies by department.
  settings: defineSettings('inventory', {
    'loans.default-length': setting.duration({ default: '14d', min: '1d', max: '365d', units: ['week', 'day'], change, audience: 'signed-in' }),
    'loans.max-length': setting.duration({ default: '120d', min: '1d', max: '365d', units: ['week', 'day'], change, audience: 'signed-in' }),
    'loans.production-grace': setting.duration({ default: '7d', min: '0d', max: '60d', units: ['week', 'day'], change, audience: 'staff' }),
    'loans.remind-before': setting.duration({ default: '2d', min: '0d', max: '14d', units: ['day'], change, audience: 'staff' }),
    'loans.overdue-every': setting.duration({ default: '3d', min: '1d', max: '30d', units: ['day'], change, audience: 'staff' }),
    // Shortening it lets the next sweep erase borrowers' details that would have been kept.
    'loans.keep-for': setting.duration({ default: '2y', min: '90d', max: '7y', units: ['year', 'month', 'week', 'day'], change, audience: 'staff', onChange: 'confirm' }),
    'inspections.remind-before': setting.duration({ default: '30d', min: '1d', max: '90d', units: ['week', 'day'], change, audience: 'staff' }),
    'inspections.first-due': setting.choice({ default: 'on-adding', options: ['on-adding', 'after-interval'], change, audience: 'staff' }),
    'faults.keep-for': setting.duration({ default: '2y', min: '90d', max: '7y', units: ['year', 'month', 'week', 'day'], change, audience: 'staff', onChange: 'confirm' }),
    'disposals.approve-above': setting.money({ default: 0, min: 0, max: 1000000, change, audience: 'staff', onChange: 'reason' }),
    'catalogue.members-browse': setting.boolean({ default: true, change, audience: 'signed-in' }),
    'labels.size': setting.choice({ default: 'small', options: ['small', 'large'], change, audience: 'staff' }),
    'hired-in.remind-before': setting.duration({ default: '7d', min: '1d', max: '60d', units: ['week', 'day'], change, audience: 'staff' }),
  }),

  // A grant on a kit department reaches its categories, items, faults, disposals and loans.
  records: defineRecords('inventory', {
    'department': { table: 'inventory_departments' },
    'category': { table: 'inventory_categories', parent: 'inventory.department' },
    'item': { table: 'inventory_items', parent: 'inventory.category' },
    'location': { table: 'inventory_locations', parent: 'core.venue' },
    'loan': { table: 'inventory_loans', parent: 'inventory.department', owner: 'responsible_account_id' },
    'inspection-kind': { table: 'inventory_inspection_kinds' },
    'fault': { table: 'inventory_faults', parent: 'inventory.item' },
    'disposal': { table: 'inventory_disposals', parent: 'inventory.item', owner: 'proposed_by' },
  }),

  // Each ability is declared with the first route that needs it (part 6 lists all sixteen).
  abilities: defineAbilities('inventory', {
    'settings.manage': ability({ risk: 'privileged' }),
  }),

  tables,

  events: {
    announces: {
      'inventory.loan.requested': event({ version: 1, payload: loan, internal: true }),
      'inventory.loan.approved': event({ version: 1, payload: loan, internal: true }),
      'inventory.loan.declined': event({ version: 1, payload: loan, internal: true }),
      'inventory.loan.cancelled': event({ version: 1, payload: loan, internal: true }),
    },
  },
})
