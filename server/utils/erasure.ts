import { eq } from 'drizzle-orm'
import { PERSONAL_TABLES } from '#shared/utils/personal-data'
import { erasureStatements } from '#shared/utils/erasure'

export interface ErasureOutcome { erased: boolean, alreadyErased: boolean }

// Idempotent: a retry finds the row already anonymised, changes nothing, and says so rather than
// failing (K-109 criterion 4, J-102 criterion 3).
export async function eraseAccount(userId: string, actorId: string | null): Promise<ErasureOutcome> {
  const account = await findById(userId)
  if (!account) throw createError({ statusCode: 404, statusMessage: 'No such account' })

  if (account.anonymisedAt !== null) return { erased: false, alreadyErased: true }

  if (await wouldStrandTheSystem('ADMIN', userId)) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That is the last administrator: grant another before erasing this one',
    })
  }

  const now = Math.floor(Date.now() / 1000)
  const statements = erasureStatements(userId, now)

  const writes = statements.map(statement => db.run(statement))
  const record = db.insert(schema.auditLog).values(auditEntry({
    actorId,
    // A null actor is the system, and an automatic erasure is not an administrator's act (0026).
    action: actorId === null ? 'account.erased.system' : actorId === userId ? 'account.erased' : 'account.erased.admin',
    target: `user:${userId}`,
    detail: { tables: PERSONAL_TABLES.length },
  }))

  // erasureStatements always returns at least the redaction and the tombstone, so the first is
  // there to give the batch its non-empty head.
  await db.batch([writes[0]!, ...writes.slice(1), record])

  return { erased: true, alreadyErased: false }
}

// A tombstone that still answers to its old address would be no tombstone at all.
export async function isTombstone(userId: string): Promise<boolean> {
  const [row] = await db.select({ anonymisedAt: schema.users.anonymisedAt })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  return row?.anonymisedAt !== null && row?.anonymisedAt !== undefined
}
