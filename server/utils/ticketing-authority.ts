import { confirmedShiftsTonight } from './rota'
import { liveGrants } from './authorise'
import { permissionsFor } from '#shared/utils/roles'
import { showNightBounds } from '#shared/utils/show-night'

// Duty manager or a ticketing manager, checked live (D-117 criterion 1). Kept apart from
// server/utils/ticket-comps.ts, which `tests/` reaches transitively and this never is (0055).
export async function isDutyManagerOrTicketingManager(accountId: string, night: string): Promise<boolean> {
  const permissions = permissionsFor(await liveGrants(accountId), new Date())
  if (permissions.has('ticketing.manage')) return true

  const { from, to } = showNightBounds(night)
  const shifts = await confirmedShiftsTonight(
    accountId, 'DUTY_MANAGER', Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000), {},
  )
  return shifts.length > 0
}
