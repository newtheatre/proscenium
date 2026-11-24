// Renames a series, makes it the default for its kind, or archives or restores it (IE-07).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, refuse } from '#kit'
import { archiveSeries, getSeries, makeDefault, seriesFields, updateSeries } from '../../../series'

const change = z.union([seriesFields, z.object({ isDefault: z.literal(true) }).strict(), z.object({ archived: z.boolean() }).strict()])

export default defineRoute({ ability: 'invoicing.settings.manage', rateLimit: 'write', input: change }, async (event, { input, unit }) => {
  const series = await getSeries(getRouterParam(event, 'id'))
  if (!series) refuse('core.not-found', 'There is no such series.', { status: 404 })
  if ('isDefault' in input) makeDefault(unit, series!)
  else if ('archived' in input) archiveSeries(unit, series!, input.archived)
  else await updateSeries(unit, series!, input)
  return { seriesId: series!.id }
})
