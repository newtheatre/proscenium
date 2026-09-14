// A role grant crosses only because a person decided it should (0070). The decisions file is the
// record: one line per old grant, read back so a re-run never asks twice and never guesses.

export type RoleDecision = { role: string, expiresAt: number | null } | 'SKIP'

export type RoleDecisions = Map<string, RoleDecision>

export const decisionKey = (userId: string, oldRole: string): string => `${userId}\t${oldRole}`

export function parseRoleDecisions(text: string): RoleDecisions {
  const decisions: RoleDecisions = new Map()
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [userId, oldRole, role, expiry] = line.split('\t')
    if (!userId || !oldRole || !role) throw new Error(`role decision line is short: ${line}`)
    if (role === 'SKIP') {
      decisions.set(decisionKey(userId, oldRole), 'SKIP')
      continue
    }
    if (expiry !== 'PERMANENT' && !/^\d+$/.test(expiry ?? '')) throw new Error(`role decision has no expiry: ${line}`)
    decisions.set(decisionKey(userId, oldRole), { role, expiresAt: expiry === 'PERMANENT' ? null : Number(expiry) })
  }
  return decisions
}

export function formatRoleDecisions(decisions: RoleDecisions): string {
  const lines = ['# old_user_id\told_role\tunified_role|SKIP\texpires_at|PERMANENT']
  for (const [key, decision] of decisions) {
    lines.push(decision === 'SKIP'
      ? `${key}\tSKIP\t`
      : `${key}\t${decision.role}\t${decision.expiresAt === null ? 'PERMANENT' : decision.expiresAt}`)
  }
  return `${lines.join('\n')}\n`
}

export interface GrantToDecide { user_id: string, role: string }

// Accepts every grant the map covers, with one expiry: the synthetic dry run and the tests use
// it, never the real run, which goes through review-roles.ts one grant at a time.
export function decideByMap(grants: readonly GrantToDecide[], roleMap: Record<string, string>, expiresAt: number | null): RoleDecisions {
  const decisions: RoleDecisions = new Map()
  for (const grant of grants) {
    const role = roleMap[grant.role]
    if (role) decisions.set(decisionKey(grant.user_id, grant.role), { role, expiresAt })
  }
  return decisions
}
