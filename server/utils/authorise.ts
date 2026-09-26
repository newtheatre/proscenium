import type { H3Event } from 'h3'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { constraintRefusal } from '#shared/utils/constraint-refusal'
import { IT_MANAGERS_CHANGED, protectedGrantRefusal, strandingBy, strandingRefusal } from '#shared/utils/protected-role'
import type { BatchItem } from 'drizzle-orm/batch'
import type { SQL } from 'drizzle-orm'
import type { ProtectedHolder, Stranding, StrandingAct } from '#shared/utils/protected-role'
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
export async function requiresSecondFactor(event: H3Event, account: AccountRow, grants: Grant[]): Promise<boolean> {
  if (account.password === null) return false
  const privileged = new Set<string>(await configValue(event, 'PRIVILEGED_ROLES'))
  return grants.some(grant => privileged.has(grant.role))
}

// Blocked until done, with the way out named in the refusal rather than left to be guessed. It
// weighs granted roles only: standing that derives carries no second factor yet (A-112).
export async function requireSecondFactorIfPrivileged(event: H3Event, resolved: Authority): Promise<void> {
  const grants = await liveGrants(resolved.account.id)
  if (await requiresSecondFactor(event, resolved.account, grants) && !await confirmedFactor(resolved.account.id)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This role needs an authenticator app before it can be used',
      data: { enrol: '/account/security' },
    })
  }
}

// Guards fail closed: a permission that is not held is a 403, and nothing reaches the handler.
export async function requirePermission(event: H3Event, permission: Permission): Promise<Authority> {
  const resolved = await authority(event)

  if (!resolved.permissions.has(permission)) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to do that' })
  }

  await requireSecondFactorIfPrivileged(event, resolved)
  return resolved
}

// For a route two narrow roles reach by different doors, neither of which should have to hold
// the other's whole grant (D-123 criterion 4).
export async function requireAnyPermission(event: H3Event, permissions: Permission[]): Promise<Authority> {
  const resolved = await authority(event)

  if (!permissions.some(permission => resolved.permissions.has(permission))) {
    throw createError({ statusCode: 403, statusMessage: 'You do not have permission to do that' })
  }

  await requireSecondFactorIfPrivileged(event, resolved)
  return resolved
}

export function owns(resolved: Authority, userId: string): boolean {
  return resolved.account.id === userId
}

// Usable excludes disabled, anonymised and pending accounts: a disabled second administrator,
// or one who has never signed in, does not satisfy the guard (A-120, 0088).
export async function protectedHolders(now = new Date()): Promise<ProtectedHolder[]> {
  return await db.all<ProtectedHolder>(protectedHoldersStatement(Math.floor(now.getTime() / 1000)))
}

async function isUsableAccount(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(and(eq(schema.users.id, userId), usableAccountWhere()))
    .limit(1)
  return row !== undefined
}

// The guard's own read, for the words of a refusal; the write carries it too (A-120 criterion 5).
export async function wouldStrandTheSystem(role: Role, userId: string, now = new Date()): Promise<Stranding | null> {
  if (role !== PROTECTED_ROLE) return null
  return strandingBy(await protectedHolders(now), userId)
}

// Every act that takes an IT Manager's standing away refuses with the same 409, naming the way out.
export async function refuseStranding(role: Role, userId: string, act: StrandingAct): Promise<void> {
  const stranding = await wouldStrandTheSystem(role, userId)
  if (stranding) throw createError({ statusCode: 409, statusMessage: strandingRefusal(stranding, act) })
}

// A grant on an account this request creates is on nobody usable yet (A-120 criterion 3).
export async function refuseProtectedGrant(userId: string | null, expiresAt: number | null): Promise<void> {
  const [holders, usable] = await Promise.all([protectedHolders(), userId === null ? false : isUsableAccount(userId)])
  const refusal = protectedGrantRefusal(holders, { userId, expiresAt, usable })
  if (refusal) throw createError({ statusCode: 409, statusMessage: refusal })
}

// The guard rides the batch as its first statement, so two officers acting at once cannot both
// pass it (A-120 criterion 5, 0035); `explain` rereads it for the words of the refusal.
export async function batchKeepingAnItManager(guard: SQL | null, writes: BatchItem<'sqlite'>[], explain: () => Promise<void>): Promise<unknown[]> {
  const statements = guard === null ? writes : [db.run(itManagerAssertion(guard)), ...writes]
  try {
    return await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]) as unknown[]
  }
  catch (error) {
    if (guard === null || !constraintRefusal([{ violated: IT_MANAGER_ASSERTION, says: IT_MANAGERS_CHANGED }], error)) throw error
    await explain()
    throw createError({ statusCode: 409, statusMessage: IT_MANAGERS_CHANGED })
  }
}
