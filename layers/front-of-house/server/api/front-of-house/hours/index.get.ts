// Volunteer hours for a date range, by person, with totals (FH-34). Reads are audited.
import { defineRoute } from '#kit'
import { hoursRange, hoursWorked } from '../../../hours'
import { hoursQuery } from '../../../inputs'

export default defineRoute({
  ability: 'front-of-house.hours.view',
  rateLimit: 'default',
  input: hoursQuery,
}, async (_event, { input }) => hoursWorked(await hoursRange(input)))
