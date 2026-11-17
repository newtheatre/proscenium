// Sets up a choice once (Spirit, Mixer, Milk), to attach to any number of products.
import { defineRoute } from '#kit'
import { addGroup, groupInput } from '../../../choices'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: groupInput }, async (_event, { input, unit }) => ({ id: addGroup(unit, input) }))
