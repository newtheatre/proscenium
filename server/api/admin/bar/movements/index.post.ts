import { sql } from 'drizzle-orm'
import { HAND_ENTERED_KINDS, KINDS_NEEDING_A_REASON, MOVEMENT_WRITERS, movementForm, says } from '#shared/utils/bar'

// Record a stock movement by hand: a delivery, wastage, an adjustment, or a reversal of one of
// them. The row is the record, so nothing here writes a second one to the trail (0010).
export default defineEventHandler(async (event) => {
  const resolved = await requirePermission(event, 'bar.write')
  const input = await readValidatedBodyOrThrow(event, movementForm)

  if (!HAND_ENTERED_KINDS.includes(input.kind)) {
    throw createError({
      statusCode: 409,
      statusMessage: `${says(input.kind)} movements are posted by ${MOVEMENT_WRITERS[input.kind]}, not by hand`,
    })
  }

  const item = await itemById(input.itemId)
  if (!item) throw createError({ statusCode: 404, statusMessage: 'No such stocked item' })
  if (item.status === 'RETIRED') {
    throw createError({ statusCode: 409, statusMessage: `${item.name} is retired: put it back before moving stock against it` })
  }

  const reason = input.reason ?? null
  if (KINDS_NEEDING_A_REASON.includes(input.kind) && reason === null) {
    throw createError({ statusCode: 400, statusMessage: `${says(input.kind)} needs a reason` })
  }

  const unitCostPence = input.unitCostPence ?? null
  if (unitCostPence !== null && input.kind !== 'DELIVERY') {
    throw createError({ statusCode: 400, statusMessage: 'A cost belongs to a delivery, which is what gross profit is measured against' })
  }
  if (input.kind === 'DELIVERY' && input.qty < 0) {
    throw createError({ statusCode: 400, statusMessage: 'A delivery adds stock: record what left as wastage or an adjustment' })
  }
  if (input.kind === 'WASTAGE' && input.qty > 0) {
    throw createError({ statusCode: 400, statusMessage: 'Wastage takes stock away, so its quantity is negative' })
  }

  const reverses = await reversalTarget(input)
  const id = newId()

  // The predicate rides the write, so two managers reversing the same movement at once produce
  // one reversal and a refusal rather than a constraint error (0003, 0006).
  const written = await db.all<{ id: string }>(sql`
    INSERT INTO stock_movements (id, item_id, qty, kind, reason, unit_cost_pence, reverses_id, actor_id)
    SELECT ${id}, ${input.itemId}, ${input.qty}, ${input.kind}, ${reason}, ${unitCostPence},
           ${reverses?.id ?? null}, ${resolved.account.id}
    WHERE ${reverses === null ? sql`1` : sql`NOT EXISTS (SELECT 1 FROM stock_movements WHERE reverses_id = ${reverses.id})`}
    RETURNING id
  `)

  if (written.length === 0) {
    throw createError({ statusCode: 409, statusMessage: 'That movement has already been reversed' })
  }

  return { ok: true, id, onHand: await onHand(input.itemId) }
})

// A reversal cancels exactly what it names, which the trigger enforces and this explains.
async function reversalTarget(input: { kind: string, itemId: string, qty: number, reversesId?: string | null }) {
  if (input.kind !== 'REVERSAL') {
    if (input.reversesId) {
      throw createError({ statusCode: 400, statusMessage: 'Only a reversal names the movement it reverses' })
    }
    return null
  }

  if (!input.reversesId) {
    throw createError({ statusCode: 400, statusMessage: 'A reversal names the movement it reverses' })
  }

  const original = await movementById(input.reversesId)
  if (!original) throw createError({ statusCode: 404, statusMessage: 'No such movement to reverse' })
  if (original.itemId !== input.itemId || original.qty !== -input.qty) {
    throw createError({
      statusCode: 409,
      statusMessage: 'A reversal cancels the movement it names: the same stocked item, and the opposite quantity',
    })
  }
  return original
}
