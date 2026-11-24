// The tax codes, with whether each is used, for the Tax codes screen (F-A2).
import { defineRoute } from '#kit'
import { listTaxCodes } from '../../tax'

export default defineRoute({ ability: 'finance.settings.manage', rateLimit: 'default' }, async () => ({ codes: await listTaxCodes() }))
