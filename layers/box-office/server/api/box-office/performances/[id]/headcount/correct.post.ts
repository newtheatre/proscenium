// A supervisor undoes a press after the undo window, with a reason from the theatre's list (HC5).
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { correctTap } from '../../../../../headcount'

const TAP_ID = /^hct_[2-7a-z]{26}$/ // not-policy: the id format, made on the device

export default defineRoute({
  ability: 'box-office.headcount.correct',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    id: z.string().regex(TAP_ID),
    reversesId: z.string().regex(TAP_ID),
    reasonTermId: z.string().min(1).max(40), // not-policy: shape bound
    deviceLabel: z.string().trim().min(1).max(40).optional(), // not-policy: shape bound
  }).strict(),
}, async (_event, { input, record }) => ({ headcount: await correctTap(record!.id!, { ...input, deviceLabel: input.deviceLabel ?? null }) }))
