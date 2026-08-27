import type { H3Event } from 'h3'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import type { Grant, Permission, Role } from '#shared/utils/roles'
import type { AccountRow } from '#server/utils/accounts'

// Live grants only: expiry is enforced at read time, so a lapsed role stops working overnight
// without a sweep having to run (0009).
export async function liveGrants(userId: string, now = new Date()): Promise<Grant[]> {
  const rows = await db.select({ role: schema.roleGrants.role, expiresAt: schema.roleGrants.expiresAt })
    .from(schema.roleGrants)
    .where(and(
      eq(schema.roleGrants.userId, userId),
      or(isNull(schema.roleGrants.expiresAt), gt(schema.roleGrants.expiresAt, Math.floor(now.getTime() / 1000))),
    ))
  return rows.filter(row => isRole(row.role)) as Grant[]
}

export interface Authority {
  account: AccountRow
  permissions: Set<Permission>
}

// Permissions from held unexpired roles, then derived authority, then ownership. Derived
// authority arrives with the shifts and records it reads (0009).
export async function authority(event: H3Event): Promise<Authority> {
  const account = await requireAccount(event)
  return { account, permissions: permissionsFor(await liveGrants(account.id), new Date()) }
}

// A privileged role needs a second factor (A-112). Google-only accounts are exempt: Workspace
// 2-step covers them and they hold no password to steal.
export async function requiresSecondFactor(account: AccountRow, grants: Grant[]): Promise<boolean> {
  if (account.password === null) return false
  const privileged = new Set<string>(CONFIG_KEYS.PRIVILEGED_ROLES.default)
  return grants.some(grant => privileged.has(grant.role))
}

// Guards fail closed: a permission that is not held is a 403, and nothing reaches the handler.
export async function requirePermission(event: H3Event, permission: Permission): Promise<Authority> {
  const resolved = await authority(event)

  if (!resolved.permissions.has(permission)) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to do that' })
  }

  // Blocked until done, with the way out named in the refusal rather than left to be guessed.
  const grants = await liveGrants(resolved.account.id)
  if (await requiresSecondFactor(resolved.account, grants) && !await confirmedFactor(resolved.account.id)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This role needs an authenticator app before it can be used',
      data: { enrol: '/account/security' },
    })
  }

  return resolved
}

export function owns(resolved: Authority, userId: string): boolean {
  return resolved.account.id === userId
}

// The last administrator cannot be removed: it is a write check rather than a constraint,
// because it depends on every other row (A-120).
export async function wouldStrandTheSystem(role: Role, userId: string, now = new Date()): Promise<boolean> {
  if (role !== PROTECTED_ROLE) return false
  // Usable excludes disabled and anonymised accounts: a disabled second administrator does not
  // satisfy the guard, or revoking the working one locks everybody out (A-120).
  const holders = await db.select({ userId: schema.roleGrants.userId })
    .from(schema.roleGrants)
    .innerJoin(schema.users, eq(schema.users.id, schema.roleGrants.userId))
    .where(and(
      eq(schema.roleGrants.role, PROTECTED_ROLE),
      or(isNull(schema.roleGrants.expiresAt), gt(schema.roleGrants.expiresAt, Math.floor(now.getTime() / 1000))),
      eq(schema.users.disabled, false),
      isNull(schema.users.anonymisedAt),
    ))
  return holders.filter(holder => holder.userId !== userId).length === 0
}
