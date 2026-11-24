// The first lines of the file for the profile's opening range (S11's Preview), with nothing recorded.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { getProfile } from '../../../../../profiles'
import { buildFile, openingRange } from '../../../../../build'
import { requireLedgerView } from '../../../../../ledger-view'

const PREVIEW_LINES = 21 // not-policy: the heading and twenty lines, as the screen shows

export default defineRoute({
  ability: 'invoicing.export.manage',
  rateLimit: 'export',
  record: event => ['invoicing.export-profile', getRouterParam(event, 'id')],
}, async (event, { actor }) => {
  await requireLedgerView(actor)
  const profile = await getProfile(getRouterParam(event, 'id')!)
  const range = await openingRange(profile)
  const file = await buildFile(profile, range.from, range.to)
  return { ...range, rows: file.rows, lines: file.csv.split('\r\n').slice(0, PREVIEW_LINES) }
})
