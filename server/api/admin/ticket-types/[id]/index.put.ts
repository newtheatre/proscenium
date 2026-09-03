import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { ticketTypeForm } from '#shared/utils/ticket-types'

// Edit a ticket type. Kind and access kind are what a sold ticket was sold under, so this does
// not take them: a type set up wrongly and never sold is deleted and made again (D-119).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'ticketing.write')

  const held = await ticketTypeById(id)
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such ticket type' })

  const input = await readValidatedBodyOrThrow(event, ticketTypeForm)
  const description = input.description ?? null
  const priceChanged = input.price !== held.price
  // The description is prose, so the trail records that it moved and never what it says (0011).
  const descriptionChanged = description !== held.description
  const otherwiseChanged = input.name !== held.name
    || descriptionChanged
    || input.activeByDefault !== held.activeByDefault

  // The name predicate rides the UPDATE, so a rename onto a name somebody is taking at the same
  // moment refuses rather than reaching the unique index (0003, 0006).
  const updated = await db.all<{ id: string }>(sql`
    UPDATE ticket_types
    SET name = ${input.name},
        description = ${description},
        price = ${input.price},
        active_by_default = ${input.activeByDefault ? 1 : 0}
    WHERE id = ${id}
      AND NOT EXISTS (SELECT 1 FROM ticket_types WHERE name = ${input.name} COLLATE NOCASE AND id <> ${id})
    RETURNING id
  `)

  if (updated.length === 0) {
    const taken = await ticketTypeNamed(input.name, id)
    if (!taken) throw createError({ statusCode: 404, statusMessage: 'No such ticket type' })
    throw createError({ statusCode: 409, statusMessage: `A ticket type is already called ${taken.name}` })
  }

  // The base price is a column and a ticket keeps the price it sold at (D-120 criterion 3), so
  // the before and after live in the trail rather than in a superseding row.
  const entries = [
    ...(priceChanged
      ? [auditEntry({
          actorId: resolved.account.id,
          action: 'ticket-type.price.changed',
          target: `ticket-type:${id}`,
          detail: changes({ price: [held.price, input.price] }),
        })]
      : []),
    ...(otherwiseChanged
      ? [auditEntry({
          actorId: resolved.account.id,
          action: 'ticket-type.updated',
          target: `ticket-type:${id}`,
          detail: {
            ...changes({
              name: [held.name, input.name],
              activeByDefault: [held.activeByDefault, input.activeByDefault],
            }),
            descriptionChanged,
          },
        })]
      : []),
  ]

  if (entries.length > 0) await db.insert(schema.auditLog).values(entries)

  return { ok: true }
})
