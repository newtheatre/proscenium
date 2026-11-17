// Expires baskets whose hold has lapsed and that no purchase cleaned up on its way past. One unit
// per basket, so one failure stops one basket and not the run.
import { createUnit, defineTask, isRefusal, log } from '#kit'
import { expireBasket, lapsedBaskets } from '../release'

export default defineTask(async () => {
  for (const orderId of await lapsedBaskets()) {
    try {
      const unit = createUnit()
      expireBasket(unit.view(), orderId)
      await unit.commit()
    }
    catch (error) {
      if (!isRefusal(error)) log.warn('box-office.sweep-failed', { orderId, error: String((error as Error)?.message ?? error) })
    }
  }
})
