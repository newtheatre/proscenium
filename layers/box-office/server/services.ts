// What other modules may import as #modules/box-office (Box office specification, part 4). Writes
// take the caller's unit of work and never commit; reads are plain functions.
export { availability } from './availability'
export type { Availability } from './availability'
export { claimSeats, releaseHold } from './capacity'
export type { ClaimRequest, ReleaseReason } from './capacity'
