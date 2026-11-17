// The fees module's panel in the till (rule P8): an application waiting for its fee, paid alone or
// alongside tickets. What prepare names is let go by the settlement handler's release.
import type { DeskBasket } from '#modules/payments'
import { deskAttach, deskPrepare, deskSummary } from '../../desk'

export default {
  label: 'membership-fees.desk.label',
  ability: 'membership-fees.payment.take',
  order: 20, // not-policy: after Box office's panel
  icon: 'i-lucide-id-card',
  panel: 'MembershipFeesTillPanel',
  prepare: deskPrepare,
  attach: deskAttach,
  summary: deskSummary,
} satisfies DeskBasket
