import { sql } from 'drizzle-orm'
import { changes } from '#shared/utils/audit'
import { checkIdRefusal, productForm } from '#shared/utils/bar'

// Edit a product. Its status is a separate decision, so this does not take one, and one pouring
// restricted stock is not saved without Check ID (issue 1299).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await productById(id)
  if (!held) throw noSuch('product')

  const input = await readValidatedBodyOrThrow(event, productForm)
  if (!await categoryById(input.categoryId)) {
    throw noSuch('category')
  }

  const note = input.allergenNote ?? null

  // The name predicate rides the UPDATE, so a rename onto a name somebody is taking at the same
  // moment refuses rather than reaching the unique index (0003, 0006, 0049).
  const applied = await auditedWrite(
    db.all<{ id: string }>(sql`
      UPDATE bar_products
      SET name = ${input.name},
          category_id = ${input.categoryId},
          sort = ${input.sort},
          staffed_only = ${input.staffedOnly ? 1 : 0},
          age_restricted = ${input.ageRestricted ? 1 : 0},
          allergen_state = ${input.allergenState},
          allergen_note = ${note}
      WHERE id = ${id}
        AND NOT EXISTS (SELECT 1 FROM bar_products WHERE name = ${input.name} COLLATE NOCASE AND id <> ${id})
        AND ${checkIdHeld(id, input.ageRestricted)}
      RETURNING id
    `),
    auditEntry({
      actorId: resolved.account.id,
      action: 'bar.product.updated',
      target: `bar-product:${id}`,
      // The allergen note is prose, so the trail records that it moved and never what it says (0011).
      detail: {
        ...changes({
          name: [held.name, input.name],
          categoryId: [held.categoryId, input.categoryId],
          sort: [held.sort, input.sort],
          staffedOnly: [held.staffedOnly, input.staffedOnly],
          ageRestricted: [held.ageRestricted, input.ageRestricted],
          allergenState: [held.allergenState, input.allergenState],
        }),
        allergenNoteChanged: note !== held.allergenNote,
      },
    }),
  )

  if (!applied) {
    const taken = await claimName('product', input.name, id)
    if (taken) throw createError({ statusCode: 409, statusMessage: `A product is already called ${taken.name}` })
    if (!await productById(id)) throw noSuch('product')
    // What it pours is read after the refusal, so the message names whatever stood in the way.
    const unchecked = checkIdRefusal({ name: input.name, ageRestricted: input.ageRestricted }, await restrictedPoursOf(id))
    throw createError({ statusCode: 409, statusMessage: unchecked ?? `${held.name} changed while you were editing it: reload and try again` })
  }

  return { ok: true }
})
