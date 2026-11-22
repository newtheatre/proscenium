// The responses table (FB-401): one row per response sent and one column per question the form has
// ever had, with retired questions marked. The filters arrive in the address, so a view can be
// shared. A special-category answer always shows here as restricted; it is opened one response at
// a time.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { can, defineRoute, useSetting } from '#kit'
import { getFields, getVersion, requireForm } from '../../../../../forms'
import { cells, columnsOf, figureColumns, listResponses, readAnswers, storedFigures } from '../../../../../responses'
import type { Definition } from '../../../../../../shared/engine'
import { hasStages, isDecision, staffMoves, stageOf } from '../../../../../../shared/engine'
import { stageIn } from '../../../../../stages'

const PAGE = 50 // not-policy: rows on one screen of a wide table
const stamp = z.coerce.number().int().min(0).optional()
const input = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1), // not-policy: shape bound
  from: stamp,
  to: stamp,
  question: z.string().max(100).optional(), // not-policy: shape bound
  value: z.string().max(300).optional(), // not-policy: shape bound
  stage: z.string().max(64).optional(), // not-policy: shape bound
})

export default defineRoute({ ability: 'forms.response.read', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'default', input }, async (_event, { input, record, actor }) => {
  const form = await requireForm(record!.id)
  const live = await getVersion(form.liveVersionId)
  const columns = columnsOf(await getFields(form.id), live ? JSON.parse(live.definition) as Definition : null)
  const { rows, total } = await listResponses(form.id, { from: input.from, to: input.to, questionId: input.question, value: input.value, stage: input.stage, reader: actor.accountId ?? undefined }, PAGE, (input.page - 1) * PAGE)
  const answers = await readAnswers(rows.map(r => r.id), new Map(columns.map(c => [c.questionId, c.type])), false)
  const on = ['forms.form', form.id] as const
  // A response keeps the stages of its own version, so each row's stage is named by that version.
  const liveDef = live ? JSON.parse(live.definition) as Definition : null
  const defs = new Map<string, Definition>()
  for (const id of new Set(rows.map(r => r.versionId))) defs.set(id, id === live?.id ? liveDef! : JSON.parse((await getVersion(id))!.definition) as Definition)
  const staged = !!liveDef && hasStages(liveDef)
  const mayMove = staged && (await can(actor, 'forms.response.move', on)).allowed
  const mayDecide = mayMove && (await can(actor, 'forms.response.decide', on)).allowed
  const currency = await useSetting('core.locale.currency') as string
  return {
    form: { id: form.id, title: form.title, slug: form.slug, anonymous: form.anonymous, status: form.status, published: form.liveVersionId !== null, canEdit: (await can(actor, 'forms.form.edit', on)).allowed },
    columns,
    // A column per calculation of the live version. One worked out from restricted answers shows as restricted.
    calculations: figureColumns(liveDef),
    rows: rows.map(r => ({ figures: storedFigures(defs.get(r.versionId)!, r.calculated, false) ?? {}, id: r.id, reference: r.reference, version: r.versionNumber, who: r.personName ?? r.respondentEmail, submittedAt: r.submittedAt, stage: hasStages(defs.get(r.versionId)!) ? { key: r.stageKey, name: stageIn(defs.get(r.versionId)!, r).name, kind: r.stageKind } : null, cells: cells(answers.get(r.id)!, columns, currency) })),
    // The stages to filter by are the live version's; a form without stages shows nothing about them.
    // Each carries the moves staff may make from it, which is what one move on several rows offers.
    stages: staged ? liveDef!.workflow!.stages.map(s => ({ key: s.key, name: s.name, kind: s.kind, moves: mayMove ? staffMoves(liveDef!, s.key, mayDecide).map(m => ({ key: m.key, label: m.label, to: stageOf(liveDef!, m.to)?.name ?? m.to, toKind: stageOf(liveDef!, m.to)?.kind ?? 'closed', decision: isDecision(liveDef!, m), needsReason: !!m.needsReason })) : [] })) : [],
    total,
    page: input.page,
    pageSize: PAGE,
    canExport: (await can(actor, 'forms.response.export', on)).allowed,
    canReadSpecial: (await can(actor, 'forms.response.read-special', on)).allowed,
  }
})
