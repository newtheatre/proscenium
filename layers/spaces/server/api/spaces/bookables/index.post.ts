// Makes a space bookable, or adds a resource such as a van or a piano (SP-05, SP-10, SP-11).
import { defineRoute } from '#kit'
import { addBookable } from '../../../setup'
import { newBookable } from '../../../inputs'

export default defineRoute({
  ability: 'spaces.bookable.manage',
  rateLimit: 'write',
  idempotent: true,
  input: newBookable,
}, (_event, { input, unit }) => ({ bookableId: addBookable(unit.view(), input) }))
