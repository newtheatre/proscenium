// What a new bill may be coded with.
import { defineRoute } from '#kit'
import { billChoices } from '../../../bills'

export default defineRoute({ ability: 'invoicing.bill.log', rateLimit: 'default' }, async () => ({ choices: await billChoices() }))
