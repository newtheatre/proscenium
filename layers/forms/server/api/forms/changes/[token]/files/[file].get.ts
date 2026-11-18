// Where a file uploaded through an emailed changes link stands while core checks it (R-19, F03).
import { getRouterParam } from 'h3'
import { defineRoute, nowMs, refuse } from '#kit'
import { responseByChangeLink } from '../../../../../changes'
import { uploadState } from '../../../../../files'

export default defineRoute({ public: true, rateLimit: 'presented-value', tokens: ['token'] }, async (event) => {
  const found = await responseByChangeLink(getRouterParam(event, 'token') ?? '', nowMs())
  const state = found ? await uploadState(found.response.id, getRouterParam(event, 'file') ?? '') : null
  if (!state) return refuse('forms.files.not-found', 'There is no such file.', { status: 404 })
  return state
})
