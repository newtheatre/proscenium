import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { createError } from 'h3'
import { auditEntry } from '#shared/utils/audit'
import { isWorkspaceEmail, normaliseEmail } from '#shared/utils/auth'

export interface AccountRow {
  id: string
  email: string
  name: string
  pronouns: string | null
  phone: string | null
  password: string | null
  // When each way in was added and last used, for the account's own security screen (A-113).
  passwordSetAt: number | null
  passwordLastUsedAt: number | null
  googleSub: string | null
  googleLinkedAt: number | null
  googleLastUsedAt: number | null
  verified: boolean
  disabled: boolean
  sessionEpoch: number
  anonymisedAt: number | null
}

export function newId(): string {
  return crypto.randomUUID().replaceAll('-', '')
}

export async function findByEmail(email: string): Promise<AccountRow | undefined> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.email, normaliseEmail(email))).limit(1)
  return row as AccountRow | undefined
}

// No password, no Google link, no passkey and not a tombstone: a guest, a console creation or an
// imported row, which "sign in as usual" would send nowhere (A-116 criterion 2, 0011).
export async function hasNoWayIn(account: AccountRow): Promise<boolean> {
  if (account.password !== null || account.googleSub !== null || account.anonymisedAt !== null) return false
  const [passkey] = await db.select({ id: schema.passkeys.id })
    .from(schema.passkeys).where(eq(schema.passkeys.userId, account.id)).limit(1)
  return passkey === undefined
}

export async function findById(id: string): Promise<AccountRow | undefined> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
  return row as AccountRow | undefined
}

// actorId is the administrator who made it from the console; a self-registration has none.
export interface NewAccount { email: string, name: string, passwordHash: string | null, actorId?: string | null }

// The account and its audit entry commit together or not at all (0001, 0003).
export async function createAccount(input: NewAccount): Promise<string> {
  const email = normaliseEmail(input.email)
  if (isWorkspaceEmail(email) && input.passwordHash !== null) {
    throw createError({ statusCode: 400, statusMessage: 'A Workspace address signs in with Google and cannot hold a password' })
  }
  const id = newId()
  const entry = auditEntry({
    actorId: input.actorId ?? null,
    action: input.actorId ? 'account.created.console' : 'account.registered',
    target: `user:${id}`,
  })

  await db.batch([
    db.insert(schema.users).values({
      id,
      email,
      name: input.name.trim(),
      password: input.passwordHash,
      passwordSetAt: input.passwordHash === null ? null : Math.floor(Date.now() / 1000),
    }),
    db.insert(schema.auditLog).values(entry),
  ])
  return id
}
