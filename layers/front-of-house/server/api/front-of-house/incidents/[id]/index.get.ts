// The whole incident: people with their welfare details, actions and the log. Every read is audited.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { readIncident } from '../../../../incidents'

export default defineRoute({
  ability: 'front-of-house.incident.view',
  record: event => ['front-of-house.incident', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, (_event, { record }) => readIncident(record!.id!))
