// A long run's progress, for the console to follow (C-04).
import { z } from 'zod'
import { getRouterParam } from 'nuxt/server'
import { defineRoute } from '#kit'
import { getRun } from '../../../../../../programme/runs'

export default defineRoute({
  ability: 'core.production.view',
  record: event => ['core.production', getRouterParam(event, 'id', { decode: true })],
  rateLimit: 'default',
  input: z.object({}),
}, async (event, { record }) => getRun(record!.id, getRouterParam(event, 'run', { decode: true })!))
