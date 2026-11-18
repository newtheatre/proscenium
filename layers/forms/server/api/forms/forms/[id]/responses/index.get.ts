// The responses table (FB-401): one row per response sent and one column per question the form has
// ever had, with retired questions marked. The filters arrive in the address, so a view can be
// shared. A special-category answer always shows here as restricted; it is opened one response at
// a time.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { can, defineRoute } from '#kit'
import { getFields, getVersion, requireForm } from '../../../../../forms'
import { cells, columnsOf, listResponses, readAnswers } from '../../../../../responses'
import type { Definition } from '../../../../../../shared/engine'

const PAGE = 50 // not-policy: rows on one screen of a wide table
const stamp = z.coerce.number().int().min(0).optional()
const input = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1), // not-policy: shape bound
  from: stamp,
  to: stamp,
  question: z.string().max(100).optional(), // not-policy: shape bound
  value: z.string().max(300).optional(), // not-policy: shape bound
})

export default defineRoute({ ability: 'forms.response.read', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'default', input }, async (_event, { input, record, actor }) => {
  const form = await requireForm(record!.id)
  const live = await getVersion(form.liveVersionId)
  const columns = columnsOf(await getFields(form.id), live ? JSON.parse(live.definition) as Definition : null)
  const { rows, total } = await listResponses(form.id, { from: input.from, to: input.to, questionId: input.question, value: input.value }, PAGE, (input.page - 1) * PAGE)
  const answers = await readAnswers(rows.map(r => r.id), new Map(columns.map(c => [c.questionId, c.type])), false)
  const on = ['forms.form', form.id] as const
  return {
    form: { id: form.id, title: form.title, slug: form.slug, anonymous: form.anonymous, status: form.status },
    columns,
    rows: rows.map(r => ({ id: r.id, reference: r.reference, version: r.versionNumber, who: r.personName ?? r.respondentEmail, submittedAt: r.submittedAt, cells: cells(answers.get(r.id)!, columns) })),
    total,
    page: input.page,
    pageSize: PAGE,
    canExport: (await can(actor, 'forms.response.export', on)).allowed,
    canReadSpecial: (await can(actor, 'forms.response.read-special', on)).allowed,
  }
})
