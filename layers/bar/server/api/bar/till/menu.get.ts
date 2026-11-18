// What an outlet sells, at its prices, for the till's bar panel, with how the age check is asked.
// The till names the list it sells from, and whether the seller may sell from it: a restricted list
// (committee prices) needs bar.sale.use-restricted-price-list at the outlet.
import { z } from 'zod'
import { can, defineRoute } from '#kit'
import { ageCheckSettings } from '../../../age-checks'
import { menu, priceLists } from '../../../catalogue'

export default defineRoute({
  ability: 'bar.sale.sell',
  rateLimit: 'default',
  input: z.object({ outlet: z.string().min(1).max(64) }), // not-policy: an id's length
}, async (_event, { input, actor }) => {
  const found = await menu(input.outlet)
  const list = (await priceLists()).find(l => l.id === found.priceListId)
  const restricted = !!list?.restricted
  return {
    ...found,
    priceListStandard: !!list?.standard,
    priceListRestricted: restricted,
    priceListAllowed: !restricted || (await can(actor, 'bar.sale.use-restricted-price-list', ['bar.outlet', input.outlet])).allowed,
    ageCheck: await ageCheckSettings(),
  }
})
