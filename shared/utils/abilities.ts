import { defineAbility } from 'nuxt-authorization/utils'
import type { BouncerAbility } from 'nuxt-authorization/utils'
import { OPERATIONAL_PERMISSIONS } from './roles'
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

// A public page is reachable by anybody, signed in or not.
export const anybody = defineAbility((_viewer: Viewer) => true)

// Standing permissions are administrative save for the night bypass (0009, 0044), so holding one
// of the rest is what admits somebody to the console at all.
export const reachConsole = defineAbility((viewer: Viewer) =>
  viewer.permissions.some(permission => !OPERATIONAL_PERMISSIONS.includes(permission)))

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

// The programme's configuration is sit-down work, so it is a standing permission like the
// catalogue's, and nothing here opens a door or a till (0009, D-119).
export const viewTicketTypes = defineAbility((viewer: Viewer) => holds(viewer, 'ticketing.read'))
export const viewProgramme = defineAbility((viewer: Viewer) => holds(viewer, 'ticketing.read'))

// The bar's catalogue and its stock register, both sit-down work. Selling over the bar is the
// till's, and the till derives from tonight rather than from either of these (0009, F-111).
export const viewBarCatalogue = defineAbility((viewer: Viewer) => holds(viewer, 'bar.read'))
export const viewBarStock = defineAbility((viewer: Viewer) => holds(viewer, 'bar.read'))

// Planning the rota is sit-down work done days ahead, so it is a standing permission and the
// officer bypass is not what opens it (0009, 0046, E-101 criterion 2).
export const viewRota = defineAbility((viewer: Viewer) => holds(viewer, 'rota.read'))
export const manageRota = defineAbility((viewer: Viewer) => holds(viewer, 'rota.write'))

// Tonight is derived from a confirmed shift and expires at 04:00 with nothing to revoke (0014,
// E-111), so it is read from the request rather than from anything the viewer holds.
export const workTonight = defineAbility((viewer: Viewer) => viewer.onShiftTonight)

// The officer bypass, which is what a viewer can hold today: the shift branch widens the viewer to
// carry tonight's night roles, and these three read it then too (0044, show night wave 3).
export const workTheDoor = defineAbility((viewer: Viewer) => holds(viewer, 'night.door'))
export const workTheTill = defineAbility((viewer: Viewer) => holds(viewer, 'night.till'))
export const manageTonight = defineAbility((viewer: Viewer) => holds(viewer, 'night.manage'))

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
  viewTicketTypes: 'ticketing.read',
  viewProgramme: 'ticketing.read',
  viewBarCatalogue: 'bar.read',
  viewBarStock: 'bar.read',
  viewRota: 'rota.read',
  manageRota: 'rota.write',
  workTheDoor: 'night.door',
  workTheTill: 'night.till',
  manageTonight: 'night.manage',
}
