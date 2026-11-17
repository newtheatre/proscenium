// Box office's part of core.change-guard (R-11): a performance with bookings is not cancelled,
// rescheduled or moved until someone has decided what happens to them, and its capacity is never
// set below the seats already taken.
import type { ChangeGuard } from '#modules/core'
import { guard } from '../../change'

export default { check: guard } satisfies ChangeGuard
