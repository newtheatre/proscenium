// Where a file uploaded for a response stands while core checks it: pending, ready or refused with
// the reason. Known only to whoever has both the response's id and the file's.
import { getRouterParam } from 'nuxt/server'
import { z } from 'zod'
import { defineRoute, idSchema, refuse } from '#kit'
import { uploadState } from '../../../../../files'

const input = z.object({ response: idSchema('fres') })

export default defineRoute({ public: true, rateLimit: 'default', input }, async (event, { input }) => {
  const state = await uploadState(input.response, getRouterParam(event, 'file', { decode: true }) ?? '')
  if (!state) return refuse('forms.files.not-found', 'There is no such file.', { status: 404 })
  return state
})
