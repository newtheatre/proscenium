// Gives a pass by hand: to a person, or to nobody in particular where the pass allows it. Its price
// is collected with the first booking it is used on, unless nothing is owed for it.
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute, idSchema } from '#kit'
import { givePass } from '../../../../pass-holding'

export default defineRoute({
  ability: 'box-office.pass.manage',
  record: event => ['box-office.pass-type', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ passPriceId: idSchema('ppr'), accountId: idSchema('acc').nullish(), settled: z.boolean().default(false), gift: z.boolean().default(false) }).strict(),
}, (_event, { input, unit, record, actor }) => givePass(unit.view(), { passTypeId: record!.id!, passPriceId: input.passPriceId, accountId: input.accountId ?? null, settled: input.settled, gift: input.gift }, actor.accountId ?? null))
