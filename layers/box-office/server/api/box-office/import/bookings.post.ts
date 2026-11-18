// Brings in bookings from another system, for a theatre moving here part-way through a season. With
// dryRun nothing is written: the answer says what each booking would do. Otherwise the bookings are
// queued as bulk jobs, each job checking its bookings again before it writes, and the answer says how
// many were queued. Importing the same file again is safe: a booking already here is left alone.
import { z } from 'zod'
import { defineRoute, newId, refuse } from '#kit'
import { BOOKINGS_PER_JOB, MOST_BOOKINGS, bookingSchema, checkBookings, comingPasses, importPasses, importPassSchema } from '../../../importing'

const MOST_PASSES = 500 // not-policy: a guard on the request's size

export default defineRoute({
  ability: 'box-office.order.import',
  rateLimit: 'export',
  input: z.object({
    bookings: z.array(bookingSchema).max(MOST_BOOKINGS).default([]),
    // Passes people hold in the other system, issued before the bookings that use them.
    passes: z.array(importPassSchema).max(MOST_PASSES).default([]),
    dryRun: z.boolean().default(false),
  }).refine(v => v.bookings.length + v.passes.length > 0, 'The file holds nothing.'),
}, async (_event, { input, unit }) => {
  // The passes are issued in this request's own batch, so they are here before any job writes a booking.
  const passes = await importPasses(unit.view(), input.passes, input.dryRun)
  const verdicts = await checkBookings(input.bookings, await comingPasses(passes))
  const count = (result: string) => verdicts.filter(v => v.result === result).length
  const issued = passes.filter(p => p.result === 'issue').length
  const summary = { passes: { issue: issued, already: passes.filter(p => p.result === 'already').length, refused: passes.filter(p => p.result === 'refused') }, import: count('import'), release: count('release'), already: count('already'), leftOut: count('left-out'), refused: verdicts.filter(v => v.result === 'refused') }
  if (input.dryRun) return { queued: 0, ...summary }
  const wanted = new Set(verdicts.filter(v => v.result === 'import' || v.result === 'release').map(v => v.reference))
  const ready = input.bookings.filter(b => wanted.has(b.reference.toUpperCase()))
  if (!ready.length && !issued) refuse('box-office.import.nothing', 'Nothing in the file would be imported.', { status: 422, remedy: 'Check what was refused, or the file may have been imported already.' })
  const importId = newId('bimp')
  for (let i = 0; i < ready.length; i += BOOKINGS_PER_JOB)
    unit.enqueue('box-office.import-bookings', { importId, bookings: ready.slice(i, i + BOOKINGS_PER_JOB) }, { dedupeKey: `${importId}:${i}` })
  unit.audit({ action: 'create', detail: { importId, queued: ready.length, refused: summary.refused.length } })
  return { queued: ready.length, importId, ...summary }
})
