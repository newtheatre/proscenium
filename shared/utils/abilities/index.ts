/**
 * Authorization abilities — re-exported by domain.
 *
 * Consumers can import from the barrel:
 *   import { updateShow } from '~~/shared/utils/abilities'
 *
 * Or from the domain file directly:
 *   import { updateShow } from '~~/shared/utils/abilities/shows'
 */
export type { AbilityUser, OwnedResource } from './types'
export { hasRole, isAdminOrManager, isStaff } from './types'

export {
  listUsers,
  createUser,
  readUser,
  updateUser,
  deleteUser,
  anonymiseUserAccount,
  updateUserRoles,
  updateUserVerified,
  resetUserPassword,
} from './users'

export {
  listVenues,
  createVenue,
  readVenue,
  updateVenue,
  deleteVenue,
  listVenueFeatures,
  createVenueFeature,
  readVenueFeature,
  updateVenueFeature,
  deleteVenueFeature,
} from './venues'

export {
  listShows,
  createShow,
  readShow,
  updateShow,
  deleteShow,
  createPerformance,
  updatePerformance,
  deletePerformance,
} from './shows'

export {
  listTicketTypes,
  createTicketType,
  readTicketType,
  updateTicketType,
  deleteTicketType,
} from './tickets'

export {
  listReservations,
  createReservation,
  readReservation,
  updateReservation,
  deleteReservation,
  refundTicket,
} from './reservations'

export {
  listSeasons,
  manageSeasons,
  listPassTypes,
  managePassTypes,
  listPasses,
  issuePass,
  redeemPass,
  cancelPass,
} from './passes'
