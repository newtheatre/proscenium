import { needsTheReader } from '#shared/utils/sale'
import { request } from './accounts'
import type { ResolveOutcome } from '#shared/utils/sumup'
import type { AppUnderTest } from './webview'

// A basket charged the way the till screen charges it (0096): a card basket with money in it is
// a typed attempt answered "Reader took it"; a tab, or nothing to take, is written at once.

interface Outcome {
  status: string
  receipt: Record<string, unknown> | null
  error: string | null
}

export function startTypedCharge(app: AppUnderTest, body: Record<string, unknown>, cookie: string): Promise<Response> {
  return request(app, 'POST', '/api/till/payments', { ...body, kind: 'TYPED' }, cookie)
}

export function answerCharge(app: AppUnderTest, id: string, outcome: ResolveOutcome, cookie: string): Promise<Response> {
  return request(app, 'POST', `/api/till/payments/${id}/resolve`, { outcome }, cookie)
}

// A refusal at the start comes back as it was; a basket the answer could no longer sell is the
// sale's own refusal found late, so it reads as a 409 carrying the attempt's reason.
export async function sellOnTheTill(app: AppUnderTest, body: Record<string, unknown>, cookie: string): Promise<Response> {
  const tabHolderId = typeof body.tabHolderId === 'string' ? body.tabHolderId : null
  const expectedTotalPence = typeof body.expectedTotalPence === 'number' ? body.expectedTotalPence : 0
  if (!needsTheReader({ tabHolderId, expectedTotalPence })) return request(app, 'POST', '/api/till/sale', body, cookie)

  const started = await startTypedCharge(app, body, cookie)
  if (!started.ok) return started
  const { id } = await started.json() as { id: string }

  const answered = await answerCharge(app, id, 'succeeded', cookie)
  if (!answered.ok) return answered
  const outcome = await answered.json() as Outcome
  if (outcome.status !== 'SUCCEEDED' || !outcome.receipt) {
    return Response.json({ statusCode: 409, statusMessage: outcome.error ?? outcome.status }, { status: 409 })
  }
  return Response.json({ ok: true, attemptId: id, ...outcome.receipt })
}
