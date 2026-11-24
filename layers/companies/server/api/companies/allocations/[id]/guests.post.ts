// Rules L2 and L3 (CO-04): a contact (through the fact) or the box office names a guest for one performance.
import { getRouterParam } from 'h3'
import { can, defineRoute, refuse } from '#kit'
import { guestInput, nameGuest, requireAllocation } from '../../../../guests'

export default defineRoute({ ability: 'signed-in', rateLimit: 'write', idempotent: true, input: guestInput }, async (event, { input, actor, unit }) => {
  const allocation = await requireAllocation(getRouterParam(event, 'id') ?? '')
  const record = ['companies.engagement', allocation.engagementId] as const
  if (!(await can(actor, 'companies.allocation.manage', record)).allowed && !(await can(actor, 'companies.guest.name', record)).allowed)
    refuse('core.access.denied', 'You cannot name guests for this engagement.', { status: 403 })
  return nameGuest(unit, actor, allocation, input)
})
