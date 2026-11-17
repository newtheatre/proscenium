// The whole incident: people with their welfare details, actions and the log. Every read is audited.
// The answer carries the categories a reviewer chooses from and the names of the people its ids
// point at, so the screen asks nothing more.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { accountLabel, listTerms } from '#modules/core'
import { readIncident } from '../../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.view',
  record: event => ['front-of-house.incident', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { record }) => {
  const incident = await readIncident(record!.id!)
  const ids = new Set([incident.reviewerId, incident.closedBy, ...incident.actions.map(a => a.ownerId), ...incident.updates.map(u => u.authorId)].filter((x): x is string => !!x))
  const names: Record<string, string> = {}
  for (const id of ids) names[id] = await accountLabel(id)
  const categories = (await listTerms('front-of-house.incident-category')).map(t => ({ id: t.id, label: t.label }))
  return { ...incident, names, categories }
})
