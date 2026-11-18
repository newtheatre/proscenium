// A reviewer hands in their review, or changes it while the round is open and not yet released
// (FB-405): marks against the criteria or a vote, and a comment. Only ever their own.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, nowMs, refuse } from '#kit'
import { getVersion } from '../../../forms'
import { getResponse } from '../../../responses'
import { ownAssignment, saveReview } from '../../../review'
import type { Definition } from '../../../../shared/engine'
import { VOTES, stageOf } from '../../../../shared/engine'

const input = z.object({
  vote: z.enum(VOTES).nullish(),
  scores: z.record(z.string().max(64), z.number()).optional(), // not-policy: shape bound
  comment: z.string().trim().max(4000).nullish(), // not-policy: shape bound
})

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', input }, async (event, { input, actor, unit }) => {
  const { assignment, round } = await ownAssignment(getRouterParam(event, 'id') ?? '', actor)
  const response = (await getResponse(assignment.responseId))!
  const definition = JSON.parse((await getVersion(response.versionId))!.definition) as Definition
  const review = stageOf(definition, round.stageKey)?.review
  if (!review) return refuse('forms.review.not-found', 'There is no review here.', { status: 404 }) // not-policy: HTTP status
  saveReview(unit, { assignment, round, review, vote: input.vote, scores: input.scores, comment: input.comment || null, at: nowMs() })
  return { ok: true }
})
