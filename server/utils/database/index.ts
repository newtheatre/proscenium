/**
 * Database utilities optimised for Cloudflare D1 compatibility
 *
 * These utilities use batch transactions instead of interactive transactions
 * and provide standardised error handling and data transformation.
 */

/**
 * Standardised error responses
 */
export const dbErrors = {
  notFound: (resource: string) => createError({
    statusCode: 404,
    statusMessage: `${resource} not found`,
  }),

  conflict: (message: string) => createError({
    statusCode: 409,
    statusMessage: message,
  }),

  validation: (message: string, data?: unknown) => createError({
    statusCode: 400,
    statusMessage: message,
    data,
  }),

  unauthorized: () => createError({
    statusCode: 401,
    statusMessage: 'Authentication required',
  }),

  forbidden: (message = 'Insufficient permissions') => createError({
    statusCode: 403,
    statusMessage: message,
  }),

  server: (message = 'Internal server error') => createError({
    statusCode: 500,
    statusMessage: message,
  }),
}

// Re-export all user-related utilities
export {
  userSelectQuery,
  type UserWithRelationsRaw,
  createUserWithRelations,
  getUserWithRelations,
  updateUserWithRelations,
  emailExistsForOtherUser,
  studentIdExistsForOtherUser,
} from './user'

// Re-export all venue-related utilities
export {
  venueSelectQuery,
  venueFeatureSelectQuery,
  type VenueWithRelationsRaw,
  type VenueFeatureRaw,
  getVenueWithRelations,
  createVenueWithFeatures,
  updateVenueWithFeatures,
  venueNameExistsForOther,
  getVenueFeatureWithVenues,
  createVenueFeature,
  updateVenueFeature,
  venueFeatureNameExistsForOther,
} from './venue'

// Shared database utilities that don't belong in specific modules go here
// (none at the moment)
