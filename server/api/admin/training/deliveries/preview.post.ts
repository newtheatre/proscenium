import { deliveryPreviewForm } from '#shared/utils/training'

// The dry-run: exactly what logging this delivery would create, per person per module (G-118 c2).
export default defineEventHandler(async (event) => {
  const resolved = await requireTrainer(event)
  const input = await readValidatedBodyOrThrow(event, deliveryPreviewForm)

  return planDelivery(resolved, input, await academicYear(event), londonToday())
})
