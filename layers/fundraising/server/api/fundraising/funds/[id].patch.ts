// Changes a fund, makes it the default, or archives or restores it (FR-05).
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute } from '#kit'
import { archiveFund, fundFields, makeDefault, requireFund, updateFund } from '../../../funds'

const change = z.union([fundFields, z.object({ isDefault: z.literal(true) }).strict(), z.object({ archived: z.boolean() }).strict()])

export default defineRoute({ ability: 'fundraising.fund.manage', rateLimit: 'write', input: change }, async (event, { input, unit }) => {
  const fund = await requireFund(getRouterParam(event, 'id')!)
  if ('isDefault' in input) makeDefault(unit.view(), fund)
  else if ('archived' in input) await archiveFund(unit.view(), fund, input.archived)
  else await updateFund(unit.view(), fund, input)
  return { fundId: fund.id }
})
