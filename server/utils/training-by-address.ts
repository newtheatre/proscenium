import { eq } from 'drizzle-orm'
import { CHOOSE_INSTEAD, PRE_LINKED, pendingGrantConstraintRefusal } from '#shared/utils/pending-grants'
import { recordByAddressStatements } from '#shared/utils/pending-records'
import type { AuditRow } from '#shared/utils/audit'
import type { RecordByAddress } from '#shared/utils/pending-records'

// The picker is the way to anybody with an account, pre-linked ones included (K-123, A-104, 0091).
export async function assertNobodyHolds(email: string): Promise<void> {
  if (await findByEmail(email)) throw createError({ statusCode: 409, statusMessage: CHOOSE_INSTEAD })
  const [preLinked] = await db.select({ name: schema.users.name }).from(schema.users)
    .where(eq(schema.users.pendingGoogleEmail, email)).limit(1)
  if (preLinked) {
    throw createError({ statusCode: 409, statusMessage: `That address is waiting to be linked to ${preLinked.name}'s account. Choose them with the search instead.` })
  }
  if (undeliverableReason({ email, anonymisedAt: null })) {
    throw createError({ statusCode: 400, statusMessage: 'Nothing can be delivered to that address' })
  }
}

// The account, the record and every entry in one batch; nothing is sent to the address (0091).
export async function writeRecordByAddress(
  newcomer: { email: string, name: string },
  actorId: string,
  record: RecordByAddress['record'],
  entriesFor: (target: string) => AuditRow[],
): Promise<string> {
  await assertNobodyHolds(newcomer.email)

  const userId = newId()
  const target = `user:${userId}`
  const statements = recordByAddressStatements({
    userId,
    ...newcomer,
    actorId,
    record,
    entries: [auditEntry({ actorId, action: 'account.created.console', target }), ...entriesFor(target)],
  }).map(statement => db.run(statement))
  try {
    await db.batch([statements[0]!, ...statements.slice(1)])
  }
  catch (error) {
    const refusal = pendingGrantConstraintRefusal(error)
    if (refusal) throw createError(refusal)
    throw error
  }
  // The batch's own predicate refused it: a pre-link landed between the check and the write.
  if (!await findById(userId)) throw createError({ statusCode: 409, statusMessage: PRE_LINKED })
  return userId
}
