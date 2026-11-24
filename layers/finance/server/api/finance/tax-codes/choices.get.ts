// The codes a product or ticket type may sell at, and whether the theatre charges VAT at all (FIN-07).
// Codes and rates are not private: any signed-in person setting prices may read them.
import { defineRoute, useSetting } from '#kit'
import { defaultTaxCode, listTaxCodes } from '../../../tax'

export default defineRoute({ ability: 'signed-in', rateLimit: 'default' }, async () => ({
  registered: await useSetting('finance.tax.registered') === true,
  usual: await defaultTaxCode(),
  codes: (await listTaxCodes()).filter(c => c.code !== 'none').map(c => ({ code: c.code, label: c.label, rateBasisPoints: c.rateBasisPoints, active: c.active })),
}))
