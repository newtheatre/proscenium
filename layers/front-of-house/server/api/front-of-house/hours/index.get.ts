// Volunteer hours for a date range, by person, with totals (FH-34). Reads are audited.
import { defineRoute } from '#kit'
import { hoursWorked } from '../../../hours'
import { hoursQuery } from '../../../inputs'

export default defineRoute({
  ability: 'front-of-house.hours.view',
  rateLimit: 'default',
  input: hoursQuery,
}, (_event, { input }) => hoursWorked(input))
