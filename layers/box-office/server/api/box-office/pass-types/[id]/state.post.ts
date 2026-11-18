// Retires a pass or brings it back, or puts it on sale or takes it off.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { setPassTypeActive, setPassTypeOnSale } from '../../../../passes'

export default defineRoute({
  ability: 'box-office.pass.manage',
  record: event => ['box-office.pass-type', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ active: z.boolean().optional(), onSale: z.boolean().optional() }).strict().refine(v => (v.active === undefined) !== (v.onSale === undefined), 'Change one of them.'),
}, async (_event, { input, unit, record }) => {
  if (input.active !== undefined) setPassTypeActive(unit.view(), record!.id!, input.active)
  else setPassTypeOnSale(unit.view(), record!.id!, input.onSale!)
  return { ok: true }
})
