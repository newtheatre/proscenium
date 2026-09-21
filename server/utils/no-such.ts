// Named rather than taken from Nitro's auto-imports, because `tests/` typechecks this file under
// Bun, where nothing is auto-imported (0055).
import { createError } from 'h3'
import { saysNoSuch } from '#shared/utils/no-such'

// The 404 itself, for the great majority of routes. A route refusing with another status builds
// its own `createError` around `saysNoSuch`.
export function noSuch(noun: string, next?: string): ReturnType<typeof createError> {
  return createError({ statusCode: 404, statusMessage: saysNoSuch(noun, next) })
}
