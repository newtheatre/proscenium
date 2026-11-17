// Setting a scheme's fee (tab 5, scheme "Fee"): a new price from a date, for every length or one,
// for joining, renewing or both. A price is never edited: the new one replaces it from its date, so a
// charge already made keeps the price it was made at (P1). A date in the past is refused for the same
// reason.
import { getRouterParam } from 'h3'
import { z } from 'zod'
import { defineRoute, first, newId, nowMs, refuse, today, useSetting } from '#kit'
import { APPLIES_TO } from '../../../../db/schema'

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // not-policy: the shape of a date

export default defineRoute({
  ability: 'membership-fees.price.manage',
  record: event => ['membership.scheme', getRouterParam(event, 'id')],
  rateLimit: 'write',
  input: z.object({
    lengthOptionId: z.string().nullable(),
    appliesTo: z.enum(APPLIES_TO),
    amountMinor: z.number().int().min(1).max(10_000_000), // not-policy: a bound on a typed amount
    fromDate: DATE,
  }).strict(),
}, async (_event, { input, actor, record, unit }) => {
  const scheme = await first<{ id: string }>('SELECT id FROM membership_schemes WHERE id = ?', record!.id)
  if (!scheme) refuse('core.not-found', 'There is no such scheme.', { status: 404 })
  if (input.lengthOptionId && !(await first('SELECT 1 AS one FROM membership_length_options WHERE id = ? AND scheme_id = ?', input.lengthOptionId, scheme!.id)))
    refuse('membership.option.unknown', 'That length is not offered on this scheme.', { status: 422, fields: { lengthOptionId: 'membership.option.unknown' } })
  if (input.fromDate < await today()) refuse('membership-fees.price.past', 'A new price starts today or later.', { status: 422, fields: { fromDate: 'membership-fees.price.past' } })
  const id = newId('mfp')
  unit.add({
    sql: 'INSERT INTO membership_fees_prices (id, scheme_id, length_option_id, amount_minor, currency, tax_code, applies_to, from_date, set_by, created_at) VALUES (?, ?, ?, ?, ?, \'none\', ?, ?, ?, ?) ON CONFLICT DO NOTHING',
    params: [id, scheme!.id, input.lengthOptionId, input.amountMinor, await useSetting('core.locale.currency') as string, input.appliesTo, input.fromDate, actor.accountId, nowMs()],
  }).expect(1, { code: 'membership-fees.price.same-day', reason: 'A price for this length and kind already starts on that day.', remedy: 'Choose another day.' })
  unit.audit({ action: 'create', record: ['membership-fees.price', id], detail: { schemeId: scheme!.id, amountMinor: input.amountMinor, appliesTo: input.appliesTo, fromDate: input.fromDate } })
  return { priceId: id }
})
