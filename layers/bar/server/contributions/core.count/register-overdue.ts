// How many days past its signing date the refusals register is, on the console home card for whoever may sign it.
import { can, type Actor } from '#kit'
import { overdueDays } from '../../age-checks'

export default {
  async value(actor: Actor) {
    if (!(await can(actor, 'bar.age-check.review')).allowed) return 0
    return await overdueDays()
  },
}
