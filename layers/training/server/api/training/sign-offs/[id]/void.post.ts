// Voids a sign-off with a reason (TR-19): the person who made it, or a holder of record.revoke.
import { getRouterParam } from 'h3'
import { can, defineRoute, first, refuse } from '#kit'
import { voidSignOff } from '../../../../progress'
import { voidInput } from '../../../../inputs'

export default defineRoute({
  ability: 'signed-in',
  rateLimit: 'write',
  input: voidInput,
}, async (event, { input, actor, unit }) => {
  const id = getRouterParam(event, 'id')!
  const row = await first<{ course_id: string }>('SELECT course_id FROM training_sign_offs WHERE id = ?', id)
  if (!row) refuse('training.sign-off.not-found', 'There is no such sign-off.', { status: 404 })
  const course = { type: 'training.course', id: row.course_id }
  if (!(await can(actor, 'training.sign-off.record', course)).allowed && !(await can(actor, 'training.record.revoke', course)).allowed)
    refuse('core.access.denied', 'You cannot void sign-offs on this course.', { status: 403 })
  await voidSignOff(unit.view(), actor, id, input.note, { mayVoidAny: (await can(actor, 'training.record.revoke', course)).allowed })
  return { signOffId: id }
})
