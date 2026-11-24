// "Show list" on the Perks tab: who has earned and had what. Reading names is audited; dietary
// needs come only with crew-call.view-needs, which audits its own read.
import { getRouterParam } from 'h3'
import { can, defineRoute } from '#kit'
import { accountLabel } from '#modules/core'
import { handoutPeople } from '../../../../../perks'

export default defineRoute({
  ability: 'front-of-house.crew-call.manage',
  record: event => ['front-of-house.crew-call', getRouterParam(event, 'id')],
  rateLimit: 'default',
}, async (_event, { actor, record, unit }) => {
  const needs = (await can(actor, 'front-of-house.crew-call.view-needs', ['front-of-house.crew-call', record!.id!])).allowed
  unit.audit({ action: 'read', ability: 'front-of-house.crew-call.manage', record: ['front-of-house.crew-call', record!.id!], detail: { list: 'perks', needs } })
  return { needs, people: await handoutPeople(record!.id!, { needs }, accountLabel) }
})
