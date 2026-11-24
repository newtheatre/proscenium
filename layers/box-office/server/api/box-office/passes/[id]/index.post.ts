// What staff do to a pass someone holds: move it to another person, cancel it or bring it back,
// record that nothing more is owed for it, or send its holder the code again.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, idSchema, newId } from '#kit'
import { movePass, sendPass, setPassVoid, settlePass } from '../../../../pass-holding'

export default defineRoute({
  ability: 'box-office.pass.manage',
  record: event => ['box-office.pass', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.discriminatedUnion('action', [
    z.object({ action: z.literal('move'), accountId: idSchema('acc') }).strict(),
    z.object({ action: z.enum(['cancel', 'restore', 'settle', 'send']) }).strict(),
  ]),
}, async (_event, { input, unit, record }) => {
  const id = record!.id!
  if (input.action === 'move') movePass(unit.view(), id, input.accountId)
  else if (input.action === 'cancel' || input.action === 'restore') setPassVoid(unit.view(), id, input.action === 'cancel')
  else if (input.action === 'settle') settlePass(unit.view(), id)
  else return { ok: true, sent: await sendPass(unit.view(), id, `again:${newId('send')}`) }
  return { ok: true }
})
