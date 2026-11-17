// A fixture panel: programmes at £3 each, for the till's browser test. It prepares nothing to undo.
import { newId, type UnitView } from '#kit'
import type { DeskBasket, DeskContext } from '#modules/payments'

const PRICE = 300 // not-policy: a fixture's price

const count = (context: Pick<DeskContext, 'input'>) => Math.max(0, Math.floor(Number((context.input as { count?: number })?.count) || 0))

export default {
  label: 'gallery.desk.label',
  panel: 'GalleryTillPanel',
  ability: 'gallery.sample.view',
  order: 50,
  async prepare(_unit: UnitView, context: DeskContext) {
    return { owner: { module: 'gallery', record: newId('gly') }, amountMinor: count(context) * PRICE }
  },
  async summary(context: Pick<DeskContext, 'input'>) {
    const n = count(context)
    return { lines: [{ label: `Programmes × ${n}`, amountMinor: n * PRICE }], amountMinor: n * PRICE }
  },
} satisfies DeskBasket
