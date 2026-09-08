import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { formatLondon } from '#shared/utils/london'
import { reassignRefusal, saysShiftRole, shiftAssignForm } from '#shared/utils/rota'

// Assign an eligible member to an open shift, or replace whoever holds it: confirmed by
// definition, so it never joins the E-105 queue (E-107 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'rota.write')
  const { userId } = await readValidatedBodyOrThrow(event, shiftAssignForm)

  const held = await shiftDetail(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such shift' })

  const subject = await findById(userId)
  if (!subject || subject.anonymisedAt !== null) throw createError({ statusCode: 404, statusMessage: 'No such member' })
  if (subject.disabled) throw createError({ statusCode: 403, statusMessage: 'That account is disabled and cannot be assigned a shift' })

  // The same live gate self-claiming rides: an officer's assignment does not admit somebody a
  // training gap would otherwise refuse (E-107 criterion 3).
  const eligibilities = await shiftEligibilities(event, userId, londonToday())
  if (!eligibilities[held.role].eligible) {
    throw createError({
      statusCode: 403,
      statusMessage: `That member does not currently qualify for a ${saysShiftRole(held.role).toLowerCase()} shift`,
    })
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'shift.reassigned',
    target: `shift:${id}`,
    detail: changes({ userId: [held.userId, userId], status: [held.status, 'CONFIRMED'] }),
  })

  // One UPDATE on the row that already exists, so replacing a duty manager never puts a second
  // CONFIRMED row on the performance for the index to arbitrate (E-107 criterion 4).
  const [assigned] = await withShiftConstraints(() => db.batch([
    db.all<{ id: string }>(assignShiftStatement(id, userId, resolved.account.id)),
    db.run(sql`
      INSERT INTO audit_log (id, actor_id, action, target, detail)
      SELECT ${entry.id}, ${entry.actorId}, ${entry.action}, ${entry.target}, ${JSON.stringify(entry.detail)}
      WHERE changes() = 1
    `),
  ]))

  if (assigned.length === 0) {
    const now = await shiftDetail(id)
    throw createError({ statusCode: 409, statusMessage: reassignRefusal(now?.status ?? held.status) })
  }

  const when = formatLondon(new Date(held.startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
  const role = saysShiftRole(held.role).toLowerCase()

  if (held.userId && held.userId !== userId) {
    await notify(event, {
      userId: held.userId,
      type: 'shift.removed',
      context: { name: '', show: held.showTitle, venue: held.venueName, when, role },
    })
  }

  await notify(event, {
    userId,
    type: 'shift.assigned',
    context: { name: '', show: held.showTitle, venue: held.venueName, when, role },
  })

  return { ok: true, status: 'CONFIRMED' }
})
