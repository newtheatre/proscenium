// Where the SumUp app sends the seller back after a hand-off, with its result in the query
// (smp-status, smp-tx-code, foreign-tx-id). The address is signed for the attempt, so it needs no
// session. The seller is then taken back to the screen that started the sale, such as the till, when
// the address names one, and otherwise to their till session, with the result.
import { z } from 'zod'
import { getQuery, getRouterParam, sendRedirect } from 'h3'
import { defineRoute } from '#kit'
import { handoffReturned } from '../../../../handoff'

export default defineRoute({
  public: true,
  rateLimit: 'public-form',
  input: z.object({}),
}, async (event) => {
  const attemptId = getRouterParam(event, 'attempt') ?? ''
  const query = getQuery(event)
  const text = (name: string) => typeof query[name] === 'string' ? query[name] as string : undefined
  const { state, intentId, returnTo } = await handoffReturned(attemptId, getRouterParam(event, 'proof') ?? '', { status: text('smp-status'), txCode: text('smp-tx-code'), foreignTxId: text('foreign-tx-id') })
  return sendRedirect(event, `${returnTo ?? '/console/payments/session'}?${new URLSearchParams({ attempt: attemptId, intent: intentId, result: state })}`)
})
