// A policy's versions, newest first: when each came into force, for the "earlier versions" list.
import { getRouterParam } from 'nuxt/server'
import { defineRoute, refuse } from '#kit'
import { listPolicies } from '../../../../../policies/service'
import { versionsOf } from '../../../../../policies/versions'

export default defineRoute({ public: true, rateLimit: 'default' }, async (event) => {
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  const policy = (await listPolicies()).find(p => p.id === id)
  if (!policy) refuse('core.not-found', 'There is nothing here.', { status: 404 })
  return { policy: { id: policy.id, title: policy.title }, versions: (await versionsOf(id)).map(v => ({ number: v.number, createdAt: v.createdAt })) }
})
