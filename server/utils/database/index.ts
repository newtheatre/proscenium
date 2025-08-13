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

// Shared database utilities that don't belong in specific modules go here
