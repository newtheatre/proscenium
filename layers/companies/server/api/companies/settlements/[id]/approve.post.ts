// Rules S7 and S8 (CO-03): approves a settlement; with Invoices off it posts once, keyed by the settlement.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { approveInput, approveSettlement, requireSettlement } from '../../../../settlements'

export default defineRoute({
  ability: 'companies.settlement.approve',
  record: event => ['companies.settlement', getRouterParam(event, 'id')],
  rateLimit: 'write',
  idempotent: true,
  input: approveInput,
}, async (_event, { input, actor, record, unit }) => approveSettlement(unit, actor, await requireSettlement(record!.id), input))
