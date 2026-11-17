// Adds an outlet. Its list is Standard unless another is chosen; one outlet at most is the desk.
import { defineRoute } from '#kit'
import { addOutlet } from '../../../catalogue'
import { outletInput } from '../../../input'

export default defineRoute({ ability: 'bar.outlet.manage', rateLimit: 'write', input: outletInput }, async (_event, { input, unit }) => ({ outletId: addOutlet(unit, input) }))
