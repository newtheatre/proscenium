// Volunteer hours as a CSV file (FH-34).
import { setResponseHeader } from 'h3'
import { defineRoute } from '#kit'
import { hoursCsv, hoursRange, hoursWorked } from '../../../hours'
import { hoursQuery } from '../../../inputs'

export default defineRoute({
  ability: 'front-of-house.hours.view',
  rateLimit: 'export',
  input: hoursQuery,
}, async (event, { input }) => {
  const { rows } = await hoursWorked(await hoursRange(input))
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', 'attachment; filename="volunteer-hours.csv"')
  return hoursCsv(rows)
})
