// The run presets, for Admin > Modules > Core > Run presets, with the theatre's usual one.
import { z } from 'zod'
import { defineRoute } from '#kit'
import { listRunPresets, theatreRunPreset } from '../../../programme/run-presets'

export default defineRoute({
  ability: 'core.programme.configure',
  rateLimit: 'default',
  input: z.object({}),
}, async () => ({ rows: await listRunPresets(), usual: await theatreRunPreset() }))
