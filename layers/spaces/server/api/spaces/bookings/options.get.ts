// What the Book a room form offers this person: rooms they may book, the purposes open to them
// in each, the productions whose team they are on, and the slot size (SP-15, SP-17, rule P2).
import { defineRoute } from '#kit'
import { formOptions } from '../../../shape'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async (_event, { actor }) => await formOptions(actor))
