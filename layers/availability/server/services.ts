// What other modules may import as #modules/availability (spec part 4).
export { levels, freshness } from './reading'
export type { LevelBlock } from './reading'
export { openRequest, closeRequest, requestStatus } from './requests'
export type { AvailabilityGroup } from './points/group'
