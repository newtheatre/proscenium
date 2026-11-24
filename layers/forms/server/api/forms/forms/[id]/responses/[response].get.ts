// One response (FB-401): its answers against the version of the form it was sent on. Special-
// category answers come back restricted unless the person asks to see them and may; each time they
// are opened is recorded.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { can, defineRoute, refuse, requireAbility } from '#kit'
import { getVersion, requireForm } from '../../../../../forms'
import { getResponse, markingOf, readAnswers, storedFigures } from '../../../../../responses'
import type { Definition } from '../../../../../../shared/engine'
import { hasStages, isDecision, publicDefinition, questionsOf, stageOf } from '../../../../../../shared/engine'
import { changedIn, historyOf, movesFor, stageIn } from '../../../../../stages'
import { refuseConflicted, roundView } from '../../../../../review'
import { runsOf } from '../../../../../actions'
import { aboutOf } from '../../../../../slots'

const input = z.object({ reveal: z.enum(['1']).optional(), revision: z.coerce.number().int().min(1).optional() })

export default defineRoute({ ability: 'forms.response.read', record: event => ['forms.form', getRouterParam(event, 'id')], rateLimit: 'default', input }, async (event, { input, record, actor, unit }) => {
  const form = await requireForm(record!.id)
  const response = await getResponse(getRouterParam(event, 'response') ?? '')
  if (!response || response.formId !== form.id || response.state !== 'submitted') return refuse('forms.response.not-found', 'There is no response here.', { status: 404 })
  await refuseConflicted(actor, response.id)
  const version = (await getVersion(response.versionId))!
  const definition = JSON.parse(version.definition) as Definition
  const open = input.reveal === '1'
  if (open) {
    await requireAbility(actor, 'forms.response.read-special', ['forms.form', form.id])
    unit.audit({ action: 'read', ability: 'forms.response.read-special', record: ['forms.response', response.id], detail: { formId: form.id } })
  }
  const types = new Map(questionsOf(definition).map(({ question }) => [question.id, question.type]))
  // An earlier revision is read by its number; the latest is shown otherwise (FB-404).
  const revision = Math.min(input.revision ?? response.currentRevision, response.currentRevision)
  const answers = (await readAnswers([response.id], types, open, revision)).get(response.id)!
  const staged = hasStages(definition)
  const stage = stageIn(definition, response)
  const mayMove = staged && (await can(actor, 'forms.response.move', ['forms.form', form.id])).allowed
  const chair = staged && (await can(actor, 'forms.response.decide', ['forms.form', form.id])).allowed
  const round = staged ? await roundView(definition, response.id, chair ? 'chair' : 'reader') : null
  return {
    response: { id: response.id, reference: response.reference, version: version.number, submittedAt: response.submittedAt, personId: response.personId, respondentEmail: response.respondentEmail },
    definition: publicDefinition(definition),
    answers,
    // How the revision shown was marked, question by question (FB-513). The correct answers themselves stay on the server.
    marking: await markingOf(response, definition, revision),
    restricted: answers.some(a => a.restricted),
    // What the calculations came to when it was sent, as the server worked them out. They belong to
    // the latest revision, so an earlier one shows none.
    calculated: revision === response.currentRevision ? storedFigures(definition, response.calculated, open) : null,
    revision,
    revisions: response.currentRevision,
    // The questions whose answers differ from the revision before this one.
    changed: await changedIn(response.id, revision),
    stage: staged ? { key: stage.key, name: stage.name, kind: stage.kind, note: response.stageNote } : null,
    moves: mayMove ? (await movesFor(definition, response, actor)).map(t => ({ key: t.key, label: t.label, to: stageOf(definition, t.to)?.name ?? t.to, toKind: stageOf(definition, t.to)?.kind ?? 'closed', decision: isDecision(definition, t), needsReason: !!t.needsReason })) : [],
    // The round of review the response is in or was last in: how far it has got, and its result once released.
    review: round ? { ...round, canRelease: chair && round.open && !round.released } : null,
    decision: response.decidedAt !== null ? { at: response.decidedAt, reason: chair ? response.decisionReason : null } : null,
    history: staged ? await historyOf(definition, response.id) : [],
    // The record the response is about, when it was answered where the form is attached to one.
    about: await aboutOf(response),
    // What other modules were asked to do by its moves. Somebody who decides may run a failed one again.
    actions: (await runsOf(response.id)).map(r => ({ ...r, canRunAgain: chair && r.state === 'failed' })),
  }
})
