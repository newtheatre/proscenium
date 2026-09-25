import { needsTheReader } from '#shared/utils/sale'

// A basket charged the way the till screen charges it (0096): a card basket with money in it is
// a typed attempt answered "Reader took it"; a tab, or nothing to take, is written at once.

interface Outcome {
  status: string
  receipt: Record<string, unknown> | null
  error: string | null
}

function post(baseURL: string, path: string, body: unknown, cookie: string): Promise<Response> {
  return fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

export async function startTypedCharge(baseURL: string, body: Record<string, unknown>, cookie: string): Promise<Response> {
  return post(baseURL, '/api/till/payments', { ...body, kind: 'TYPED' }, cookie)
}

export async function answerCharge(baseURL: string, id: string, outcome: 'succeeded' | 'declined' | 'abandoned', cookie: string, note?: string): Promise<Response> {
  return post(baseURL, `/api/till/payments/${id}/resolve`, { outcome, ...(note ? { note } : {}) }, cookie)
}

// A refusal at the start comes back as it was; a basket the answer could no longer sell is the
// sale's own refusal found late, so it reads as a 409 carrying the attempt's reason.
export async function sellOnTheTill(baseURL: string, body: Record<string, unknown>, cookie: string): Promise<Response> {
  const tabHolderId = typeof body.tabHolderId === 'string' ? body.tabHolderId : null
  const expectedTotalPence = typeof body.expectedTotalPence === 'number' ? body.expectedTotalPence : 0
  if (!needsTheReader({ tabHolderId, expectedTotalPence })) return post(baseURL, '/api/till/sale', body, cookie)

  const started = await startTypedCharge(baseURL, body, cookie)
  if (!started.ok) return started
  const { id } = await started.json() as { id: string }

  const answered = await answerCharge(baseURL, id, 'succeeded', cookie)
  if (!answered.ok) return answered
  const outcome = await answered.json() as Outcome
  if (outcome.status !== 'SUCCEEDED' || !outcome.receipt) {
    return Response.json({ statusCode: 409, statusMessage: outcome.error ?? outcome.status }, { status: 409 })
  }
  return Response.json({ ok: true, attemptId: id, ...outcome.receipt })
}
