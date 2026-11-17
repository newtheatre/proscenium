// Every choice with its options, for the Products set-up screens.
import { defineRoute } from '#kit'
import { choiceGroups } from '../../../choices'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'default' }, async () => ({ groups: await choiceGroups() }))
