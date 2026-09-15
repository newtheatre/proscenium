import { tillScopeForm } from '#shared/utils/till'
import { londonDayOf } from '#shared/utils/ledger'

// The approver's queue: every pending request for tonight, priced live so what is shown is what
// would actually be given away (F-110). Read by whoever may decide one: the decide routes' pair.
export default defineEventHandler(async (event) => {
  const scope = await getValidatedQueryOrThrow(event, tillScopeForm)
  const resolved = await requireAnyNightAuthority(event, ['DUTY_MANAGER', 'BAR'], scope)

  const expiryMinutes = await configValue(event, 'COMP_REQUEST_EXPIRY_MINUTES')
  const requests = await pendingCompRequests(resolved.venueId, resolved.night, expiryMinutes)
  const on = londonDayOf(new Date())
  // Resolved once for the whole queue, not once per request: a read that scales with an unrelated
  // table's rows is the same shape an IN list is (0003).
  const catalogue = await activeVariantsWithChoices(on)
  const priced = await Promise.all(requests.map(async request => ({
    request,
    priced: await priceBasketAgainst((await compRequestLines(request.id)) ?? [], catalogue, null),
  })))

  return { ok: true, requests: priced }
})
