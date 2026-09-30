import { SHIFT_ROLES } from '#shared/utils/rota'
import type { ShiftRole } from '#shared/utils/rota'
import type { TrainingAction } from '#shared/utils/training-action'

interface RoleCard {
  role: ShiftRole
  openShifts: number
  // The published module that opens the role, or null when nothing a member can act on is named.
  module: { id: string, name: string } | null
  action: TrainingAction | null
}

// "Roles you could take": one card per role the caller does not qualify for, saying how many of
// its shifts are open, what opens it and the one thing to do about that (issue 1335, E-103 c2).
export default defineEventHandler(async (event) => {
  const account = await requireAccount(event)
  const today = londonToday()
  const now = Math.floor(Date.now() / 1000)

  const eligibilities = await shiftEligibilities(event, account.id, today)
  // A role no training opens for this member is not one they could take (0115).
  const locked = SHIFT_ROLES.filter(role => !eligibilities[role].eligible && !eligibilities[role].needsCommittee)
  if (locked.length === 0) return { roles: [] as RoleCard[], officers: [] as string[] }

  const [counts, [openings], actionFor, officers] = await Promise.all([
    db.all<{ role: ShiftRole, total: number }>(openShiftCountsByRoleQuery(now)),
    locked.includes('BAR') ? db.all<{ total: number }>(countOpenOpeningShiftsQuery(now)) : Promise.resolve([{ total: 0 }]),
    trainingActionsFor(account.id, today, await configValue(event, 'SESSION_SIGNUP_CLOSES_HOURS')),
    locked.some(role => eligibilities[role].unlockedBy === null) ? fohManagerNames() : Promise.resolve([] as string[]),
  ])

  const roles = locked.map((role): RoleCard => {
    const module = eligibilities[role].unlockedBy
    return {
      role,
      openShifts: (counts.find(row => row.role === role)?.total ?? 0) + (role === 'BAR' ? openings?.total ?? 0 : 0),
      module: module ? { id: module.moduleId, name: module.moduleName } : null,
      action: module ? actionFor(module.moduleId) : null,
    }
  })

  return { roles, officers }
})
