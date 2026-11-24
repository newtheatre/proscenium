// Starting points for a new role (Admin, Roles): the usual jobs in a theatre, each a set of abilities
// by name. Choosing one fills the new role's form, keeping only the abilities that are declared, whose
// module is on and that the person making the role holds; nothing is saved until they create it. The
// name and description are translated: core.roles.templates.<id>.name and .description.

export interface RoleTemplate { id: string, abilities: string[] }

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'producer',
    abilities: [
      'core.production.view', 'core.production.create', 'core.production.edit', 'core.production.publish',
      'core.performance.schedule', 'core.season.manage', 'core.collection.manage',
      'box-office.performance.manage', 'box-office.pricing.manage', 'box-office.order.view', 'box-office.report.view', 'box-office.comp.approve',
      'front-of-house.shift.view', 'front-of-house.night-report.view',
    ],
  },
  {
    id: 'box-office',
    abilities: [
      'core.production.view', 'core.account.find',
      'box-office.order.view', 'box-office.order.sell', 'box-office.order.take-payment', 'box-office.order.release', 'box-office.order.exchange',
      'box-office.ticket.admit', 'box-office.comp.request',
      'payments.session.open', 'payments.session.view',
      'membership.card.check',
    ],
  },
  {
    id: 'front-of-house-manager',
    abilities: [
      'core.production.view',
      'front-of-house.shift.view', 'front-of-house.shift.manage', 'front-of-house.assignment.check-in', 'front-of-house.duty.manage',
      'front-of-house.checklist.complete', 'front-of-house.checklist.manage', 'front-of-house.emergency-card.view',
      'front-of-house.night-report.write', 'front-of-house.night-report.sign-off', 'front-of-house.night-report.view',
      'front-of-house.incident.report', 'front-of-house.incident.view', 'front-of-house.incident.manage', 'front-of-house.hours.view',
      'box-office.order.view', 'box-office.ticket.admit', 'box-office.headcount.correct',
    ],
  },
  {
    id: 'bar',
    abilities: [
      'bar.sale.sell', 'bar.sale.view', 'bar.stock.view', 'bar.stock.receive', 'bar.stock.waste', 'bar.stock.count', 'bar.age-check.view',
      'payments.session.open', 'payments.session.view',
    ],
  },
  {
    id: 'treasurer',
    abilities: [
      'finance.ledger.view', 'finance.ledger.export', 'finance.posting.correct', 'finance.account.manage', 'finance.period.close',
      'box-office.report.view', 'box-office.report.export',
      'payments.attempt.reconcile', 'payments.refund.approve', 'payments.session.view',
      'membership-fees.charge.view', 'membership-fees.charge.waive',
      'bar.sale.view',
      'invoicing.export.manage', 'invoicing.settings.manage',
    ],
  },
]
