// One budget (BC-10, BC-12): its lines with budgeted, committed, pending, spent and remaining, the
// budgets it funds, its approved amounts' history, and what the viewer may do to it.
import { getRouterParam } from 'h3'
import { can, defineRoute, first } from '#kit'
import { requireBudget } from '../../../budgets'
import { budgetView } from '../../../changes'

export default defineRoute({ ability: 'budgets.budget.view', record: event => ['budgets.budget', getRouterParam(event, 'id')], rateLimit: 'default' }, async (_event, { actor, record }) => {
  const budget = await requireBudget(record!.id)
  const subject = budget.productionId
    ? await first<{ label: string, to: string }>('SELECT title AS label, \'/console/productions/\' || id AS "to" FROM core_productions WHERE id = ?', budget.productionId)
    : budget.seasonId
      ? await first<{ label: string, to: null }>('SELECT name AS label, NULL AS "to" FROM core_seasons WHERE id = ?', budget.seasonId)
      : budget.departmentTermId
        ? await first<{ label: string, to: null }>('SELECT label, NULL AS "to" FROM core_terms WHERE id = ?', budget.departmentTermId)
        : null
  return {
    ...await budgetView(budget),
    subject,
    canManage: (await can(actor, 'budgets.budget.manage')).allowed,
    canApprove: (await can(actor, 'budgets.budget.approve')).allowed,
    ownProposal: budget.proposedBy === actor.accountId,
  }
})
