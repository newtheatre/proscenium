// Imports members into a scheme from a file (MEM-49). With dryRun nothing is written: the answer says
// how many rows would import, how many of them have already ended, and which would be refused. Otherwise the rows are queued as bulk jobs
// and the answer says how many were queued; each job checks its rows again before writing.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, newId, refuse, today } from '#kit'
import { requireScheme } from '../../../../schemes'
import { MOST_ROWS, ROWS_PER_JOB, checkRows, parseMembers } from '../../../../importing'

export default defineRoute({
  ability: 'membership.membership.import',
  record: event => ['membership.scheme', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'export',
  input: z.object({
    file: z.string().max(2_000_000), // not-policy: the request body D1 can carry
    dryRun: z.boolean().default(false),
    // Rows whose end date has already passed would be lapsed at once and use up a member number: leave them out.
    skipEnded: z.boolean().default(false),
  }),
}, async (_event, { input, actor, record, unit }) => {
  const scheme = await requireScheme(record!.id)
  if (scheme.state !== 'open' && scheme.state !== 'closed') refuse('membership.import.scheme-state', 'Members can be imported only into an open or closed scheme.', { status: 409 })
  const { rows, refused: unreadable } = parseMembers(input.file)
  if (rows.length > MOST_ROWS) refuse('membership.import.too-many', `A file may hold at most ${MOST_ROWS} rows.`, { status: 422, remedy: 'Split the file and import each part.' })
  if (!rows.length) refuse('membership.import.empty', 'No row of the file could be read.', { status: 422 })
  const day = await today()
  const { ready: checked, refused } = await checkRows(scheme, rows, actor.accountId ?? null, day)
  const alreadyEnded = checked.filter(r => r.endsOn && r.endsOn < day).length
  const ready = input.skipEnded ? checked.filter(r => !(r.endsOn && r.endsOn < day)) : checked
  const all = [...unreadable, ...refused].sort((a, b) => a.line - b.line)
  if (input.dryRun) return { queued: 0, wouldImport: ready.length, alreadyEnded, refused: all }
  if (!ready.length) refuse('membership.import.nothing', 'Every row of the file would be refused.', { status: 422 })
  const importId = newId('mimp')
  for (let i = 0; i < ready.length; i += ROWS_PER_JOB)
    unit.enqueue('membership.import-members', { importId, schemeId: scheme.id, importedBy: actor.accountId ?? null, day, rows: ready.slice(i, i + ROWS_PER_JOB) }, { dedupeKey: `${importId}:${i}` })
  unit.audit({ action: 'create', record: ['membership.scheme', scheme.id], detail: { importId, queued: ready.length, refused: all.length } })
  return { queued: ready.length, importId, refused: all }
})
