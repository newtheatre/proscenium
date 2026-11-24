// Tells the holders of a course that a version requiring retraining cut their training short (V6),
// a page at a time on the bulk lane, so publishing stays one quick write however many hold it.
import { defineJob } from '#kit'
import { tellCutShort } from '../lapsing'

export default defineJob<{ courseId: string, versionId: string, after: string | null }>(async (payload, unit) => {
  const next = await tellCutShort(unit, payload)
  if (next) unit.enqueue('training.notify-holders', { ...payload, after: next })
})
