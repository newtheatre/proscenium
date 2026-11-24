// S9: one save of the person's answers, changeable until the poll closes (F7).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { voteInput } from '../../../../inputs'
import { vote } from '../../../../polls'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: voteInput }, async (event, { actor, input, unit }) => {
  await vote(unit.view(), getRouterParam(event, 'id')!, actor, input.answers)
  return { saved: true }
})
