// Imports past awards of one type from a file. A dry run answers what would happen: how many rows
// would import and which would be refused. Otherwise the rows are queued as bulk jobs and the
// answer says how many. Nobody is told of an imported award.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, newId, refuse } from '#kit'
import { MOST_ROWS, ROWS_PER_JOB, checkRows, parseAwards } from '../../../../importing'
import { requireType } from '../../../../types'

export default defineRoute({
  ability: 'awards.award.issue',
  record: event => ['awards.type', getRouterParam(event, 'id')],
  rateLimit: 'export',
  input: z.object({
    file: z.string().max(2_000_000), // not-policy: the request body D1 can carry
    dryRun: z.boolean().default(false),
  }),
}, async (_event, { input, actor, record, unit }) => {
  const type = await requireType(record!.id)
  if (type.state !== 'active') refuse('awards.type.archived', `${type.name} is archived, so it cannot be given.`, { status: 409, remedy: 'Restore the award first.' })
  const { rows, refused: unreadable } = parseAwards(input.file)
  if (rows.length > MOST_ROWS) refuse('awards.import.too-many', `A file may hold at most ${MOST_ROWS} rows.`, { status: 422, remedy: 'Split the file and import each part.' })
  if (!rows.length) refuse('awards.import.empty', 'No row of the file could be read.', { status: 422, remedy: 'Each row needs a name and the date or year it was awarded.' })
  const { ready, refused } = await checkRows(type, rows, actor.accountId ?? null)
  const all = [...unreadable, ...refused].sort((a, b) => a.line - b.line)
  if (input.dryRun) return { queued: 0, wouldImport: ready.length, refused: all }
  if (!ready.length) refuse('awards.import.nothing', 'Every row of the file would be refused.', { status: 422 })
  const importId = newId('aimp')
  for (let i = 0; i < ready.length; i += ROWS_PER_JOB)
    unit.enqueue('awards.import-awards', { importId, typeId: type.id, importedBy: actor.accountId ?? null, rows: ready.slice(i, i + ROWS_PER_JOB) }, { dedupeKey: `${importId}:${i}` })
  unit.audit({ action: 'create', record: ['awards.type', type.id], detail: { importId, queued: ready.length, refused: all.length } })
  return { queued: ready.length, importId, refused: all }
})
