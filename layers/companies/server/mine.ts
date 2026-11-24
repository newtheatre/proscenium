// Your companies (part 5, CO-08): what a contact sees under My account. Each engagement of each
// company they act for, with what they owe at the top, oldest deadline first.
import { all, nowMs } from '#kit'
import { accountScopeSql } from '#kit/accounts'
import type { MyEngagement, ToDo } from '../shared/views'

/** The engagements of every company the account is a live contact of, cancelled ones left out. */
export async function myEngagements(accountId: string): Promise<MyEngagement[]> {
  const rows = await all<Omit<MyEngagement, 'toDo'>>(`
    SELECT e.id, e.title, e.kind, e.state, c.id AS companyId, coalesce(c.public_name, c.name) AS company,
      (SELECT min(p.starts_at) FROM core_performances p WHERE p.production_id = e.production_id) AS firstDate,
      (SELECT max(p.starts_at) FROM core_performances p WHERE p.production_id = e.production_id) AS lastDate
    FROM companies_contacts k JOIN companies_companies c ON c.id = k.company_id JOIN companies_engagements e ON e.company_id = c.id
    WHERE k.ended_at IS NULL AND c.archived_at IS NULL AND e.state <> 'cancelled' AND k.account_id IN (${accountScopeSql('?1')})
    ORDER BY e.state = 'settled', firstDate IS NULL, firstDate, e.created_at`, accountId)
  if (!rows.length) return []
  const owed = await toDo(accountId)
  return rows.map(r => ({ ...r, toDo: owed.filter(o => o.engagementId === r.id).map(({ engagementId: _, ...o }) => o) }))
}

/** What a contact owes: guests to name before the deadline, an agreement to answer, a settlement to agree (part 5, "To do"). */
async function toDo(accountId: string): Promise<(ToDo & { engagementId: string })[]> {
  const scope = `SELECT e.id FROM companies_contacts k JOIN companies_engagements e ON e.company_id = k.company_id
    WHERE k.ended_at IS NULL AND e.state <> 'cancelled' AND k.account_id IN (${accountScopeSql('?1')})`
  const [guests, agreements, settlements] = await Promise.all([
    all<{ engagementId: string, count: number, due: number }>(`SELECT engagement_id AS engagementId, sum(places - named) AS count, min(names_due_at) AS due
      FROM companies_allocations WHERE state = 'open' AND named < places AND names_due_at > ?2 AND engagement_id IN (${scope}) GROUP BY engagement_id`, accountId, nowMs()),
    all<{ engagementId: string }>(`SELECT engagement_id AS engagementId FROM companies_agreements WHERE state = 'sent' AND engagement_id IN (${scope})`, accountId),
    all<{ engagementId: string }>(`SELECT engagement_id AS engagementId FROM companies_settlements WHERE state = 'proposed' AND engagement_id IN (${scope})`, accountId),
  ])
  return [
    ...guests.map(g => ({ engagementId: g.engagementId, kind: 'name-guests' as const, count: g.count, due: g.due })),
    ...agreements.map(a => ({ engagementId: a.engagementId, kind: 'answer-agreement' as const, count: 1, due: null })),
    ...settlements.map(s => ({ engagementId: s.engagementId, kind: 'agree-settlement' as const, count: 1, due: null })),
  ].sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity))
}
