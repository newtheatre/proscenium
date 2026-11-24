// The full bank details, for the person about to pay in their bank. Every read is audited.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { readPayee } from '../../../../payees'

export default defineRoute({ ability: 'payments.payee.read', rateLimit: 'default' }, async (event, { unit }) => ({
  details: await readPayee(unit, getRouterParam(event, 'id') ?? ''),
}))
