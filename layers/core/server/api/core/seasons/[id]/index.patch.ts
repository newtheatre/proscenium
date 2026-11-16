// Changes a season's name, dates or summary.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateSeason } from '../../../../programme/service'
import { seasonPatch } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.season.manage',
  rateLimit: 'write',
  input: seasonPatch,
}, async (event, { input, unit }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await updateSeason(unit, id, input)
  return { id }
})
