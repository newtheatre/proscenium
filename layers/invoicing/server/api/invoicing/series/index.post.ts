// A new series of invoices or credit notes (IE-07).
import { z } from 'zod'
import { defineRoute } from '#kit'
import { createSeries, seriesFields } from '../../../series'

export default defineRoute({ ability: 'invoicing.settings.manage', rateLimit: 'write', idempotent: true, input: seriesFields.extend({ kind: z.enum(['invoice', 'credit_note']) }) }, async (_event, { input, unit }) => (
  { seriesId: createSeries(unit, input) }
))
