#!/usr/bin/env bun
// The one interactive step of the import: a person accepts, changes or skips every live old grant
// and the answer lands in out/role-decisions.tsv (0070). Nothing here writes to any database.
import { join } from 'node:path'
import { OUT, ROOT, ensureOut, latestStamp, loadDump } from './lib'
import { administratorDecisions, decisionHolder, decisionKey, formatRoleDecisions, parseRoleDecisions } from './role-decisions'
import type { RoleDecision, RoleDecisions } from './role-decisions'
import { formatLondon, nextCommitteeYearEnd } from '../shared/utils/london'
import { PROTECTED_ROLE, ROLES, isRole } from '../shared/utils/roles'

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
    // A decision naming a role that has since been retired is asked again, never carried (0090).
    const pending = held.filter((grant) => {
      const decided = decisions.get(decisionKey(userId, grant.role))
      return reviewAll || !decided || (decided !== 'SKIP' && !isRole(decided.role))
    })
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

  // Dated, every IT Manager lapses with nobody left to grant another, so one is made permanent
  // here, by a person's choice, or the build refuses the file (A-120 criterion 1).
  const holderOf = (userId: string) => auth.query<Holder, [string]>('SELECT * FROM users WHERE id = ?').get(userId)
  // The build counts only live grants on enabled, unerased holders (migration/identity.ts).
  const counts = (userId: string): boolean => {
    const holder = holderOf(userId)
    return holder !== null && !holder.disabled && !holder.email.endsWith('@anonymised.invalid')
  }
  const counted = new Set(grants.filter(grant => counts(grant.user_id)).map(grant => decisionKey(grant.user_id, grant.role)))
  const administrators = administratorDecisions(new Map([...decisions].filter(([key]) => counted.has(key))))
  if (!administrators.permanent.length && !administrators.dated.length) {
    console.log('\nNo grant is decided as IT Manager, so the build will refuse. Re-run with --review-all to choose one.')
  }
  else if (!administrators.permanent.length) {
    console.log('\nNo IT Manager grant is permanent, so every one would lapse with nobody left to grant another.')
    administrators.dated.forEach((key, index) => {
      const holder = holderOf(decisionHolder(key))
      console.log(`  [${index + 1}] ${holder ? `${holder.name} <${holder.email}>` : decisionHolder(key)}`)
    })
    const chosen = administrators.dated[Number(ask('  make which one permanent? (blank leaves them dated, and the build refuses): ')) - 1]
    if (chosen) {
      decisions.set(chosen, { role: PROTECTED_ROLE, expiresAt: null })
      await save()
    }
  }

  const undecided = grants.filter(grant => !decisions.has(decisionKey(grant.user_id, grant.role))).length
  console.log(`\n${asked} decision(s) recorded this run; ${decisions.size} on file; ${undecided} live grant(s) still undecided.`)
  console.log(`Saved to ${join(OUT, DECISIONS_FILE)}. Re-run with --review-all to revisit everything.`)
  auth.close()
}
