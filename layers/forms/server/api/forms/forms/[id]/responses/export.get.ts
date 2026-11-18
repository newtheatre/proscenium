// The responses as CSV (FB-402), under the same filters as the table. Taking answers out in bulk
// needs its own ability and is recorded. Special-category answers are left out unless the person
// may read them and asks for them.
import { getRouterParam, setResponseHeader } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse, requireAbility, useSetting } from '#kit'
import { getFields, getVersion, requireForm } from '../../../../../forms'
import { cells, columnsOf, listResponses, readAnswers, toCsv } from '../../../../../responses'
import type { Definition } from '../../../../../../shared/engine'

const CHUNK = 200 // not-policy: responses read at a time, to keep each query small
const stamp = z.coerce.number().int().min(0).optional()
const input = z.object({
  from: stamp,
  to: stamp,
  question: z.string().max(100).optional(), // not-policy: shape bound
  value: z.string().max(300).optional(), // not-policy: shape bound
  special: z.enum(['1']).optional(),
})

export default defineRoute({ ability: 'forms.response.export', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'export', input }, async (event, { input, record, actor, unit }) => {
  const form = await requireForm(record!.id)
  const special = input.special === '1'
  if (special) await requireAbility(actor, 'forms.response.read-special', ['forms.form', form.id])
  const live = await getVersion(form.liveVersionId)
  const all = columnsOf(await getFields(form.id), live ? JSON.parse(live.definition) as Definition : null)
  const columns = all.filter(c => special || c.dataClass !== 'special')
  const filter = { from: input.from, to: input.to, questionId: input.question, value: input.value }
  const most = await useSetting('forms.limits.export-rows') as number

  const lines: string[][] = []
  const types = new Map(columns.map(c => [c.questionId, c.type]))
  for (let offset = 0; ; offset += CHUNK) {
    const { rows, total } = await listResponses(form.id, filter, CHUNK, offset)
    if (total > most) return refuse('forms.export.too-many', `This would export ${total} responses, and one export holds ${most}.`, { status: 422, remedy: 'Narrow the dates and export in parts.' })
    const answers = await readAnswers(rows.map(r => r.id), types, special)
    for (const r of rows) {
      const row = cells(answers.get(r.id)!, columns)
      lines.push([r.reference, new Date(r.submittedAt).toISOString(), String(r.versionNumber), r.personName ?? r.respondentEmail ?? '', ...columns.map(c => row[c.questionId]?.text ?? '')])
    }
    if (rows.length < CHUNK) break
  }

  unit.audit({ action: 'export', record: ['forms.form', form.id], detail: { responses: lines.length, special } })
  setResponseHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'content-disposition', `attachment; filename="${form.slug}-responses.csv"`)
  return toCsv(['Reference', 'Sent', 'Version', 'From', ...columns.map(c => c.retired ? `${c.key} (removed)` : c.key)], lines)
})
