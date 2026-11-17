// Saves the Add a run window's start times as a run preset: anyone who can add runs may (Matt,
// 2026-11-17). Changing or deleting one is Admin's.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { createRunPreset } from '../../../../../programme/run-presets'
import { runPresetInput } from '../../../../../programme/input'

export default defineRoute({
  ability: 'core.performance.schedule',
  record: event => ['core.production', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: runPresetInput,
}, async (_event, { unit, input, actor }) => ({ id: await createRunPreset(unit, input, actor.accountId ?? null) }))
