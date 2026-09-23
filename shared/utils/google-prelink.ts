import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { isWorkspaceEmail, normaliseEmail } from './auth'

// An administrator pre-linking a Workspace address to an account, which the account's first Google
// sign-in consumes (A-104 criterion 6, 0008). The account keeps its own address when it does.

export interface PreLinkTarget {
  googleSub: string | null
  anonymisedAt: number | null
}

// Another account the address already leads to, by its own address or by its pending link.
export interface PreLinkHolder {
  name: string
  how: 'email' | 'pending'
}

export interface PreLinkRefusal {
  statusCode: 400 | 409
  statusMessage: string
}

export const PRELINK_ERASED = 'That account has been erased'
export const PRELINK_ALREADY_GOOGLE = 'That account already signs in with Google'
export const PRELINK_NOT_WORKSPACE = 'Only a newtheatre.org.uk address can be linked for Google sign-in'
export const PRELINK_LOST_RACE = 'Somebody else linked that address first. Reload the account to see who.'

export function preLinkHeldBy(holder: PreLinkHolder): string {
  const leads = holder.how === 'email'
    ? `That address already belongs to ${holder.name}'s account.`
    : `That address is already waiting to be linked to ${holder.name}'s account.`
  return `${leads} If they are the same person, merge the two accounts instead.`
}

// Lowercased exactly as sign-in lowercases it, so the link is found by the lookup that consumes it.
export function preLinkAddress(value: string | null): string | null {
  return value === null ? null : normaliseEmail(value)
}

export function preLinkRefusal(target: PreLinkTarget, email: string | null, holder: PreLinkHolder | null): PreLinkRefusal | null {
  if (target.anonymisedAt !== null) return { statusCode: 409, statusMessage: PRELINK_ERASED }
  if (email === null) return null
  if (!isWorkspaceEmail(email)) return { statusCode: 400, statusMessage: PRELINK_NOT_WORKSPACE }
  if (target.googleSub !== null) return { statusCode: 409, statusMessage: PRELINK_ALREADY_GOOGLE }
  if (holder) return { statusCode: 409, statusMessage: preLinkHeldBy(holder) }
  return null
}

export function preLinkHolderStatement(userId: string, email: string): SQL {
  return sql`select name, case when email = ${email} then 'email' else 'pending' end as how
    from users where id <> ${userId} and (email = ${email} or pending_google_email = ${email}) limit 1`
}

// Every refusal rides the statement as its predicate, so a check that raced reads zero rows back
// rather than writing (0003); the unique index on the column backs the pending half.
export function preLinkStatement(userId: string, email: string | null): SQL {
  if (email === null) {
    return sql`update users set pending_google_email = null
      where id = ${userId} and pending_google_email is not null and anonymised_at is null
      returning id`
  }
  return sql`update users set pending_google_email = ${email}
    where id = ${userId} and google_sub is null and anonymised_at is null
      and pending_google_email is not ${email}
      and not exists (select 1 from users other where other.id <> ${userId}
        and (other.email = ${email} or other.pending_google_email = ${email}))
    returning id`
}

// Identifiers only: the address is on the account, never in the trail (0011).
export function preLinkDetail(replaced: boolean): Record<string, unknown> {
  return { replaced }
}
