import { confirmedShiftsTonight } from '#server/utils/rota'
import { liveGrants } from '#server/utils/authorise'
import { permissionsFor } from '#shared/utils/roles'
import { showNightBounds } from '#shared/utils/show-night'

// Duty manager or bar manager, checked live rather than trusted from a client-sent flag: real
// only because the submitting account actually holds the authority (F-108, F-110). Shared so a
// tab-cap override and a comp approval never diverge on who counts as a manager.
export async function isDutyOrBarManager(accountId: string, night: string): Promise<boolean> {
  const permissions = permissionsFor(await liveGrants(accountId), new Date())
  if (permissions.has('bar.write')) return true

  const { from, to } = showNightBounds(night)
  const shifts = await confirmedShiftsTonight(
    accountId, 'DUTY_MANAGER', Math.floor(from.getTime() / 1000), Math.floor(to.getTime() / 1000), {},
  )
  return shifts.length > 0
}
