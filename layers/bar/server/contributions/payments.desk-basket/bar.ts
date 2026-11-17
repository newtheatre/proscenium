// The bar's panel in the till (tab 3, "One payment for drinks, with or without tickets"): drinks on
// their own, or beside tickets on one payment. What prepare makes is let go by the settlement
// handler's release.
import type { DeskBasket } from '#modules/payments'
import { deskAttach, deskPrepare, deskSummary } from '../../selling'

export default {
  label: 'bar.desk.label',
  tab: 'bar.desk.tab',
  ability: 'bar.sale.sell',
  order: 10, // not-policy: after Box office's panel, before membership fees
  icon: 'i-lucide-beer',
  panel: 'BarTillPanel',
  livePanel: 'BarTillLivePanel',
  prepare: deskPrepare,
  attach: deskAttach,
  summary: deskSummary,
} satisfies DeskBasket
