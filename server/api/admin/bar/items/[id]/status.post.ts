import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { stockItemStatusForm } from '#shared/utils/bar'

// Retire a stocked item, or put it back. Retiring takes it off the lists and leaves every
// movement it carries exactly where it is (F-114 criterion 1).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await itemById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such stocked item' })

  const { status, hideDependents } = await readValidatedBodyOrThrow(event, stockItemStatusForm)
  if (status === held.status) {
    throw createError({
      statusCode: 409,
      statusMessage: status === 'RETIRED' ? `${held.name} is already retired` : `${held.name} is not retired`,
    })
  }

  if (status === 'RETIRED' && held.onHand !== 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.name} still has stock on hand: write it off or count it out before retiring it`,
    })
  }

  if (status === 'RETIRED') {
    const dependents = await dependentProducts(id)
    if (dependents.length > 0 && !hideDependents) {
      throw createError({
        statusCode: 409,
        statusMessage: `${held.name} is poured by ${dependents.map(product => product.name).join(', ')}: change those recipes, or retire it and hide them together`,
        data: { dependents },
      })
    }

    // Every predicate rides its own statement, so a delivery or a recipe change landing between
    // the reads above and the batch cannot slip past (known issues, 0006, 0049).
    const statements = retireItemStatements(id, { actorId: resolved.account.id, hideDependents })
    await db.batch(statements.map(statement => db.run(statement)) as unknown as Parameters<typeof db.batch>[0])

    const now = await itemById(id)
    if (now?.status !== 'RETIRED') {
      throw createError({
        statusCode: 409,
        statusMessage: `${held.name} changed while you were editing it`,
      })
    }
    return { ok: true, status, hidden: dependents.length }
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.item.status.changed',
    target: `bar-item:${id}`,
    detail: changes({ status: [held.status, status] }),
  })

  const applied = await auditedWrite(
    db.all<{ id: string }>(sql`
      UPDATE bar_items SET status = ${status} WHERE id = ${id} AND status = ${held.status} RETURNING id
    `),
    entry,
  )

  // A losing racer is refused, not told it succeeded: the audit stayed silent, so the caller
  // must too (0049).
  if (!applied) {
    const now = await itemById(id)
    if (!now) throw createError({ statusCode: 404, statusMessage: 'No such stocked item' })
    throw createError({
      statusCode: 409,
      statusMessage: now.status === status
        ? `${now.name} is not retired`
        : `${now.name} changed while you were editing it`,
    })
  }

  return { ok: true, status }
})
