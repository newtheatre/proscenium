// Releases reservations nobody has paid for once their release time has come (R-6), skipping any
// marked to keep; an order being paid for is not reserved and so is not found. One unit per order.
import { createUnit, defineTask, isRefusal, log } from '#kit'
import { dueReservations, releaseReservation } from '../release'

export default defineTask(async () => {
  for (const orderId of await dueReservations()) {
    try {
      const unit = createUnit()
      await releaseReservation(unit.view(), orderId, 'task')
      await unit.commit()
    }
    catch (error) {
      if (!isRefusal(error)) log.warn('box-office.release-failed', { orderId, error: String((error as Error)?.message ?? error) })
    }
  }
})
