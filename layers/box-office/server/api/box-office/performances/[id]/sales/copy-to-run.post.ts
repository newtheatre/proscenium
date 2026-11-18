// Copies this performance's set-up to every other performance of its production with nothing set up
// yet (box office review S2), so a run is set up once rather than night by night.
import { z } from 'zod'
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { copyToRun } from '../../../../../run-setup'

export default defineRoute({
  ability: 'box-office.performance.manage',
  record: event => ['core.performance', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: z.object({ confirmOverVenue: z.boolean().optional() }).strict(),
}, (_event, { input, record, actor, unit }) => copyToRun(unit.view(), record!.id!, actor, { confirmOverVenue: input.confirmOverVenue }))
