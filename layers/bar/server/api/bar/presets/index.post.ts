// Saves a product preset from the Add a product window: sizes, measures, choices and overrides only.
import { defineRoute } from '#kit'
import { addPreset, presetInput } from '../../../presets'

export default defineRoute({ ability: 'bar.product.manage', rateLimit: 'write', input: presetInput }, async (_event, { input, actor, unit }) => ({ presetId: addPreset(unit, input, actor.accountId!) }))
