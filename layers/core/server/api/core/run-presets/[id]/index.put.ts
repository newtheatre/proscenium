// Changes a run preset's name or start times. Performances already added are not changed.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { updateRunPreset } from '../../../../programme/run-presets'
import { runPresetInput } from '../../../../programme/input'

export default defineRoute({
  ability: 'core.programme.configure',
  rateLimit: 'write',
  input: runPresetInput,
}, async (event, { unit, input }) => {
  const id = getRouterParam(event, 'id') ?? ''
  await updateRunPreset(unit, id, input)
  return { id }
})
