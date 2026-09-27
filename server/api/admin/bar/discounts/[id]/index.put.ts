import { changes } from '#shared/utils/audit'
import { discountForm } from '#shared/utils/discounts'

// Edit a bar discount. Every sale already charged keeps its own snapshot, so this never restates
// what was actually charged, only what applying it does from now on (F-117 criterion 3).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  const resolved = await requirePermission(event, 'bar.write')

  const held = await discountById(id)
  if (!held) throw noSuch('discount')

  const input = await readValidatedBodyOrThrow(event, discountForm)

  const cap = await configValue(event, 'BAR_DISCOUNT_MAX_PERCENT')
  if (input.percent > cap) {
    throw createError({ statusCode: 409, statusMessage: `A discount cannot exceed ${cap}%: ${input.name} asked for ${input.percent}%` })
  }

  const entry = auditEntry({
    actorId: resolved.account.id,
    action: 'bar.discount.updated',
    target: `bar-discount:${id}`,
    detail: changes({
      name: [held.name, input.name],
      percent: [held.percent, input.percent],
    }),
  })
  const updated = await auditedWrite(
    db.all(renameDiscountStatement({ id, name: input.name, percent: input.percent, actorId: resolved.account.id })),
    entry,
  )

  if (!updated) {
    const taken = await discountNamed(input.name, id)
    if (!taken) throw noSuch('discount')
    throw createError({ statusCode: 409, statusMessage: `A discount is already called ${taken.name}` })
  }

  return { ok: true }
})
