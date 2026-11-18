// Brings in bookings from another system, for a theatre moving here part-way through a season. With
// dryRun nothing is written: the answer says what each booking would do. Otherwise the bookings are
// queued as bulk jobs, each job checking its bookings again before it writes, and the answer says how
// many were queued. Importing the same file again is safe: a booking already here is left alone.
import { z } from 'zod'
import { defineRoute, newId, refuse } from '#kit'
import { BOOKINGS_PER_JOB, MOST_BOOKINGS, bookingSchema, checkBookings } from '../../../importing'

export default defineRoute({
  ability: 'box-office.order.import',
  rateLimit: 'export',
  input: z.object({
    bookings: z.array(bookingSchema).min(1).max(MOST_BOOKINGS),
    dryRun: z.boolean().default(false),
  }),
}, async (_event, { input, unit }) => {
  const verdicts = await checkBookings(input.bookings)
  const count = (result: string) => verdicts.filter(v => v.result === result).length
  const summary = { import: count('import'), release: count('release'), already: count('already'), leftOut: count('left-out'), refused: verdicts.filter(v => v.result === 'refused') }
  if (input.dryRun) return { queued: 0, ...summary }
  const wanted = new Set(verdicts.filter(v => v.result === 'import' || v.result === 'release').map(v => v.reference))
  const ready = input.bookings.filter(b => wanted.has(b.reference.toUpperCase()))
  if (!ready.length) refuse('box-office.import.nothing', 'Nothing in the file would be imported.', { status: 422, remedy: 'Check what was refused, or the file may have been imported already.' })
  const importId = newId('bimp')
  for (let i = 0; i < ready.length; i += BOOKINGS_PER_JOB)
    unit.enqueue('box-office.import-bookings', { importId, bookings: ready.slice(i, i + BOOKINGS_PER_JOB) }, { dedupeKey: `${importId}:${i}` })
  unit.audit({ action: 'create', detail: { importId, queued: ready.length, refused: summary.refused.length } })
  return { queued: ready.length, importId, ...summary }
})
