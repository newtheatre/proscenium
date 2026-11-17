// A new run preset, made under Admin > Modules > Core > Run presets.
import { defineRoute } from '#kit'
import { createRunPreset } from '../../../programme/run-presets'
import { runPresetInput } from '../../../programme/input'

export default defineRoute({
  ability: 'core.programme.configure',
  rateLimit: 'write',
  input: runPresetInput,
}, async (_event, { unit, input, actor }) => ({ id: await createRunPreset(unit, input, actor.accountId ?? null) }))
