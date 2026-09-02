import { defineAbility } from 'nuxt-authorization/utils'
import type { BouncerAbility } from 'nuxt-authorization/utils'
import type { Permission } from './roles'

// Named views over the permission map, never a second vocabulary: an ability says which screen a
// viewer may see, and PERMISSIONS in roles.ts stays the only place authority is defined.
export interface Viewer {
  id: string
  permissions: Permission[]
  onShiftTonight: boolean
  // Derived authority, resolved per request and never granted: a lead reads the catalogue and a
  // trainer runs a session without either holding a standing permission (0009, G-110, G-111).
  leadsDepartment: boolean
  isTrainer: boolean
}

const holds = (viewer: Viewer, permission: Permission): boolean => viewer.permissions.includes(permission)

// An ability denies a signed-out caller before its body runs, so this is every signed-in member.
export const signedIn = defineAbility((_viewer: Viewer) => true)

// Standing permissions are administrative only (0009), so holding any of them is what admits
// somebody to the console at all.
export const reachConsole = defineAbility((viewer: Viewer) => viewer.permissions.length > 0)

export const viewAccounts = defineAbility((viewer: Viewer) => holds(viewer, 'accounts.read'))
export const viewMembers = defineAbility((viewer: Viewer) => holds(viewer, 'members.read'))
export const viewFellows = defineAbility((viewer: Viewer) => holds(viewer, 'fellowships.read'))
export const viewRooms = defineAbility((viewer: Viewer) => holds(viewer, 'rooms.read'))
export const decideRoomRequests = defineAbility((viewer: Viewer) => holds(viewer, 'rooms.write'))
export const viewAuditTrail = defineAbility((viewer: Viewer) => holds(viewer, 'audit.read'))
export const viewSettings = defineAbility((viewer: Viewer) => holds(viewer, 'config.read'))

// The catalogue admits a lead who holds no standing permission, so the sidebar has to admit them
// too or it would hide a screen they can open (requireCatalogueReader, G-110).
export const viewTrainingCatalogue = defineAbility((viewer: Viewer) => holds(viewer, 'training.read') || viewer.leadsDepartment)

// Running a session derives from a current trainer certification (requireTrainer, G-111).
export const runTrainingSessions = defineAbility((viewer: Viewer) => holds(viewer, 'training.write') || viewer.isTrainer)

export const recalculateTraining = defineAbility((viewer: Viewer) => holds(viewer, 'training.recalculate'))

// Tonight is derived from a confirmed shift and expires at 04:00 with nothing to revoke (0014,
// E-111), so it is read from the request rather than from anything the viewer holds.
export const workTonight = defineAbility((viewer: Viewer) => viewer.onShiftTonight)

// Every ability here is a pure function of the viewer, and the chrome already holds one. Asking
// synchronously keeps the layouts out of Suspense, which they would otherwise re-enter per render.
export function can(viewer: Viewer | null, ability: BouncerAbility<Viewer>): boolean {
  const answer = ability.execute(viewer)
  if (typeof answer === 'boolean') return answer
  return answer instanceof Promise ? false : answer.authorized
}

// The permission each ability stands on, so a test can prove the vocabulary has not drifted.
export const ABILITY_PERMISSIONS: Record<string, Permission> = {
  viewAccounts: 'accounts.read',
  viewMembers: 'members.read',
  viewFellows: 'fellowships.read',
  viewRooms: 'rooms.read',
  decideRoomRequests: 'rooms.write',
  viewAuditTrail: 'audit.read',
  viewSettings: 'config.read',
  viewTrainingCatalogue: 'training.read',
  runTrainingSessions: 'training.write',
  recalculateTraining: 'training.recalculate',
}
