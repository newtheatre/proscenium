import { sql } from 'drizzle-orm'
import { londonDayOf } from '#shared/utils/ledger'
import { variantChoiceForm } from '#shared/utils/bar'
import type { BatchItem } from 'drizzle-orm/batch'

// Attach a choice group to a variant, or clear it. Its stocked-ingredient components (F-113
// criterion 1) are untouched: that recipe surface is components.put.ts's.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await variantById(id, londonDayOf(new Date()))
  if (!held) throw createError({ statusCode: 404, statusMessage: 'No such serving size' })

  const { choiceGroupId, qty, includedInPrice } = await readValidatedBodyOrThrow(event, variantChoiceForm)

  const group = choiceGroupId ? await choiceGroupById(choiceGroupId) : undefined
  if (choiceGroupId && !group) throw createError({ statusCode: 404, statusMessage: 'No such choice group' })

  if (group) {
    const retired = await retiredOptionsOf(group.id)
    if (retired.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: `${group.name} offers ${retired.join(' and ')}, which ${retired.length > 1 ? 'are' : 'is'} retired: fix its options before attaching it`,
      })
    }
  }

  // A variant offers at most one choice group, so attaching a new one replaces the last rather
  // than adding a second (0017).
  const statements: BatchItem<'sqlite'>[] = [
    db.delete(schema.variantComponents).where(sql`variant_id = ${id} AND choice_group_id IS NOT NULL`),
    ...(group
      ? [db.insert(schema.variantComponents).values({
          id: newId(),
          variantId: id,
          choiceGroupId: group.id,
          qty,
          includedInPrice,
        })]
      : []),
    db.insert(schema.auditLog).values(auditEntry({
      actorId: resolved.account.id,
      action: 'bar.variant.choice.changed',
      target: `bar-variant:${id}`,
      detail: { choiceGroupId: group?.id ?? null, includedInPrice: group ? includedInPrice : false },
    })),
  ]

  await db.batch(statements as unknown as Parameters<typeof db.batch>[0])

  return { ok: true, choiceGroupId: group?.id ?? null }
})
