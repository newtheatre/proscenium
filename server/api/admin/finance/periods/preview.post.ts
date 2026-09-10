import { closePeriodForm } from '#shared/utils/period-locks'

// What closing would warn about before it proceeds, not a refusal (I-107 criterion 5).
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'finance.read')
  const input = await readValidatedBodyOrThrow(event, closePeriodForm)
  return await blockingConditionsFor(input.fromDay, input.toDay)
})
