import { londonDayOf } from '#shared/utils/ledger'
import { variantChoiceForm } from '#shared/utils/bar'

// Attach a choice group to a variant, or clear it. Its stocked-ingredient components (F-113
// criterion 1) are untouched: that recipe surface is components.put.ts's.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await variantById(id, londonDayOf(new Date()))
  if (!held) throw noSuch('serving size')

  const { choiceGroupId, qty, includedInPrice, optional } = await readValidatedBodyOrThrow(event, variantChoiceForm)

  const group = choiceGroupId ? await choiceGroupById(choiceGroupId) : undefined
  if (choiceGroupId && !group) throw noSuch('choice group')

  if (group) {
    const retired = await retiredOptionsOf(group.id)
    if (retired.length > 0) {
      throw createError({
        statusCode: 409,
        statusMessage: `${group.name} offers ${retired.join(' and ')}, which ${retired.length > 1 ? 'are' : 'is'} retired: fix its options before attaching it`,
      })
    }
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.variant.choice.changed',
    target: `bar-variant:${id}`,
    detail: { choiceGroupId: group?.id ?? null, includedInPrice: group ? includedInPrice : false, optional: group ? optional : false },
  })

  // A variant offers at most one choice group, so attaching a new one replaces the last rather
  // than adding a second (0017).
  const { logged, writes } = attachChoiceStatements(id, group ? { choiceGroupId: group.id, qty, includedInPrice, optional } : null, entry)
  const [landed] = await db.batch([db.all<{ id: string }>(logged), ...writes.map(statement => db.run(statement))])

  if ((landed as { id: string }[]).length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: `${held.label} depletes no stocked item of its own, so served without its choice it would sell an empty glass: add one under What it depletes first`,
    })
  }

  return { ok: true, choiceGroupId: group?.id ?? null }
})
