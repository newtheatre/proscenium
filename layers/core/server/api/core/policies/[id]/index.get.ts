// One policy: its sections in order, each by its address in the `policies` content collection, for
// the page to draw. Which sections apply is decided here, from what is switched on and set today.
import { getRouterParam } from 'h3'
import { defineRoute, refuse } from '#kit'
import { resolvePolicy, sectionPath } from '../../../../policies/service'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const resolved = await resolvePolicy(getRouterParam(event, 'id') ?? '')
  if (!resolved) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  const { policy, sections, revised } = resolved
  return {
    policy: { id: policy.id, title: policy.title, summary: policy.summary ?? null, kind: policy.kind },
    sections: sections.map(s => ({ id: s.id, title: s.title, path: sectionPath(s) })),
    revised,
  }
})
