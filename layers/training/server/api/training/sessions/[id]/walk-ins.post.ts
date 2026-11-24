// Adds a walk-in, with or without an account, and marks them attended in one act (P7, TR-12).
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { walkInInput } from '../../../../inputs'
import { addWalkIn } from '../../../../sessions'

export default defineRoute({
  ability: 'training.session.run',
  record: event => ['training.session', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: walkInInput,
}, (_event, { record, input, actor, unit }) => addWalkIn(unit.view(), actor, record!.id, input))
