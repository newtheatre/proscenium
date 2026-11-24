// Records a T-shirt or a meal handed out (HO1, HO2).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { accountLabel } from '#modules/core'
import { recordHandout } from '../../../../../perks'

export default defineRoute({
  ability: 'front-of-house.handout.record',
  record: event => ['front-of-house.crew-call', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({
    accountId: z.string().min(1).max(40), // not-policy: shape bound
    item: z.enum(['tshirt', 'meal']),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), // not-policy: a date's shape
    size: z.string().trim().min(1).max(20).nullish(), // not-policy: shape bound, as the table's CHECK
  }).strict(),
}, (_event, { input, actor, record, unit }) => recordHandout(unit.view(), { callId: record!.id!, ...input, by: actor }, accountLabel))
