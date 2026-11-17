// One booking of a decision to refund everyone for a cancelled or changed performance (BO-52). Each
// booking is its own job, so one whose refund fails is retried and listed without holding up the rest.
import { defineJob } from '#kit'
import { cancelForPerformance } from '../change'

export default defineJob<{ orderId: string, performanceId: string, what: string }>(async (payload, unit) => {
  await cancelForPerformance(unit, payload.orderId, payload.performanceId, payload.what)
})
