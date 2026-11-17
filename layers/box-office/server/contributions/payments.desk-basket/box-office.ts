// Box office's panel in the till (Box office specification, part 4, "One payment with several
// owners"): a reservation to take payment for, or tickets to sell to somebody at the desk. What it
// prepares is undone by the settlement handler's release.
import type { DeskBasket } from '#modules/payments'
import { deskAttach, deskPrepare, deskSummary } from '../../desk'

export default {
  label: 'box-office.desk.label',
  // Seeing the panel takes the least a seller has; each use is then checked on its own record.
  ability: 'box-office.order.view',
  order: 0,
  panel: 'BoxOfficeTillPanel',
  prepare: deskPrepare,
  attach: deskAttach,
  summary: deskSummary,
} satisfies DeskBasket
