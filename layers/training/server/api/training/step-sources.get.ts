// The activities that can sign off a step, for the course editor (H1): empty when no module that
// contributes one is switched on, and then activity steps cannot be chosen.
import { defineRoute } from '#kit'
import { stepSources } from '../../sources'

export default defineRoute({
  ability: 'training.course.manage',
  rateLimit: 'default',
}, async () => ({
  sources: (await stepSources()).map(x => ({ id: x.id, module: x.module, label: x.source.label, picker: x.source.picker ?? null, ability: x.source.ability ?? null })),
}))
