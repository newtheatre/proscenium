// Signs off the night: everyone not named a no-show worked; the snapshot is written (FH-32).
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { signOff } from '../../../../../reports'

export default defineRoute({
  ability: 'front-of-house.night-report.sign-off',
  record: event => ['core.performance', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ noShows: z.array(z.string().min(1).max(40)).max(200).default([]) }).strict(), // not-policy: shape bound
}, (_event, { input, record, actor, unit }) => signOff(unit.view(), { performanceId: record!.id!, noShows: input.noShows, by: actor.accountId! }))
