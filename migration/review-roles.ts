#!/usr/bin/env bun
// The one interactive step of the import: a person accepts, changes or skips every live old grant
// and the answer lands in out/role-decisions.tsv (0070). Nothing here writes to any database.
import { join } from 'node:path'
import { OUT, ROOT, ensureOut, latestStamp, loadDump } from './lib'
import { decisionKey, formatRoleDecisions, parseRoleDecisions } from './role-decisions'
import type { RoleDecision, RoleDecisions } from './role-decisions'
import { formatLondon, nextCommitteeYearEnd } from '../shared/utils/london'
import { ROLES } from '../shared/utils/roles'

interface Holder {
  id: string
  email: string
  name: string
  password: string | null
  google_sub: string | null
  email_verified: number
  disabled: number
}

interface Grant { user_id: string, role: string, expires_at: number | null, granted_at: number | null }

export const DECISIONS_FILE = 'role-decisions.tsv'

export async function readRoleDecisions(dir = OUT): Promise<RoleDecisions> {
  const file = Bun.file(join(dir, DECISIONS_FILE))
  return await file.exists() ? parseRoleDecisions(await file.text()) : new Map()
}

// The grants a decision is owed for: live in the old estate, on a person who exists there.
export function liveGrants(auth: import('bun:sqlite').Database, now: number): Grant[] {
  return auth.query<Grant, [number]>(
    'SELECT user_id, role, expires_at, granted_at FROM user_roles WHERE expires_at IS NULL OR expires_at >= ? ORDER BY user_id, role',
  ).all(now)
}

function ask(question: string): string {
  const answer = prompt(question)
  if (answer === null) {
    console.log('\nStopped. Decisions so far are saved.')
    process.exit(0)
  }
  return answer.trim().toLowerCase()
}

if (import.meta.main) {
  const stamp = await latestStamp()
  ensureOut()
  const reviewAll = process.argv.includes('--review-all')
  const now = Math.floor(Date.now() / 1000)
  const yearEnd = nextCommitteeYearEnd(new Date())
  const yearEndSeconds = Math.floor(yearEnd.getTime() / 1000)
  const yearEndLabel = formatLondon(yearEnd, { dateStyle: 'long' })

  const auth = await loadDump('auth', stamp)
  const roleMap: Record<string, string> = await Bun.file(join(ROOT, 'migration/role-map.json')).json()
  const decisions = await readRoleDecisions()
  const save = () => Bun.write(join(OUT, DECISIONS_FILE), formatRoleDecisions(decisions))

  const grants = liveGrants(auth, now)
  const byHolder = new Map<string, Grant[]>()
  for (const grant of grants) byHolder.set(grant.user_id, [...(byHolder.get(grant.user_id) ?? []), grant])

  let asked = 0
  for (const [userId, held] of byHolder) {
    const pending = held.filter(grant => reviewAll || !decisions.has(decisionKey(userId, grant.role)))
    if (!pending.length) continue

    const holder = auth.query<Holder, [string]>('SELECT * FROM users WHERE id = ?').get(userId)
    if (!holder) {
      for (const grant of pending) decisions.set(decisionKey(userId, grant.role), 'SKIP')
      await save()
      continue
    }
    const methods = [holder.password ? 'password' : null, holder.google_sub ? 'Google' : null].filter(Boolean).join(', ') || 'no way to sign in'
    const flags = [holder.email_verified ? 'verified' : 'unverified', holder.disabled ? 'DISABLED' : null, holder.email.endsWith('@anonymised.invalid') ? 'ANONYMISED' : null].filter(Boolean).join(', ')
    console.log(`\n${holder.name} <${holder.email}>  (${methods}; ${flags})`)
    console.log(`  holds: ${held.map(grant => grant.role).join(', ')}`)

    for (const grant of pending) {
      const suggested = roleMap[grant.role]
      const defaultSkip = holder.disabled === 1 || holder.email.endsWith('@anonymised.invalid')
      const options = suggested
        ? `[a] accept ${suggested} until ${yearEndLabel}  [p] accept ${suggested} permanently  [c] change role  [s] skip`
        : `[c] choose a role  [s] skip (no suggestion for ${grant.role})`
      let decision: RoleDecision | undefined
      while (!decision) {
        const answer = ask(`  ${grant.role} -> ${options}${defaultSkip ? '  (default: skip)' : ''}: `) || (defaultSkip ? 's' : '')
        if (answer === 's') decision = 'SKIP'
        else if (answer === 'a' && suggested) decision = { role: suggested, expiresAt: yearEndSeconds }
        else if (answer === 'p' && suggested) decision = { role: suggested, expiresAt: null }
        else if (answer === 'c') {
          console.log(`    roles: ${ROLES.join(', ')}`)
          const role = ask('    role (blank to cancel): ').toUpperCase()
          if (!(ROLES as readonly string[]).includes(role)) continue
          const permanent = ask(`    permanent? [y/N] (N = until ${yearEndLabel}): `) === 'y'
          decision = { role, expiresAt: permanent ? null : yearEndSeconds }
        }
      }
      decisions.set(decisionKey(userId, grant.role), decision)
      asked++
      await save()
    }
  }

  const undecided = grants.filter(grant => !decisions.has(decisionKey(grant.user_id, grant.role))).length
  console.log(`\n${asked} decision(s) recorded this run; ${decisions.size} on file; ${undecided} live grant(s) still undecided.`)
  console.log(`Saved to ${join(OUT, DECISIONS_FILE)}. Re-run with --review-all to revisit everything.`)
  auth.close()
}
