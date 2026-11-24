// Sample set box-office.sold-house (Practice mode, part 4; BO-77): tonight's performance of the
// practice play about 60% sold, with four reservations still unpaid, one seat taken by a pass, and
// a booking for tomorrow whose code the door should turn away. The bookings come in as an import
// does (importing.ts), as bookings made and paid elsewhere, so each is a unit of its own.
import { all, createUnit, definePracticeSample, refuse, useContext, useSetting, wordsFrom } from '#kit'
import { importPasses, importShare, type ImportBooking } from '../../importing'
import { createPassType } from '../../passes'
import { setPrices } from '../../prices'
import { houseOf } from '../../layouts'
import { createBand, createTicketType, listTicketTypes, openSales, saveSales } from '../../setup'
import { ensureManagedTicketTypes } from '../../ticket-types'
import en from '../../../i18n/en-GB.json'

const t = wordsFrom(en)

/** What the trainee types at the door for tomorrow's booking: eight letters the door's box accepts. */
export const TOMORROW_CODE = 'TMRW2345'
export const PASS_CODE = 'PRACTICE-PASS-1'
const MOST_SEATS = 40 // not-policy: a small house keeps the store quick to make
const SOLD = 0.6 // not-policy: the spec's "60% sold"
const RESERVED = 4 // not-policy: the spec's four unpaid reservations
const PRICE = 1200 // not-policy: a practice price
const PASS_PRICE = 3600 // not-policy: a practice pass, worth three shows

type Person = { name: string, address: string }

/** The practice people, from core.people, by their undeliverable addresses. */
const people = () => all<Person>(`SELECT a.name, e.address FROM core_accounts a JOIN core_account_emails e ON e.account_id = a.id
  WHERE e.address LIKE '%@practice.invalid' ORDER BY a.name`)

/** A standard ticket type anyone may buy at the desk, the theatre's own if it has one. */
async function fullPrice(): Promise<{ id: string, name: string, made: boolean }> {
  const found = (await listTicketTypes()).find(type => type.active && type.available && type.kind === 'standard' && !type.requirementRefs.length && type.channel !== 'online')
  return found ? { id: found.id, name: found.name, made: false } : { id: '', name: t('box-office.practice.full-price'), made: true }
}

async function setUp(production: string, nights: string[]): Promise<{ type: string }> {
  // The types box office keeps itself, such as a pass's entry, as on a site just set up.
  await ensureManagedTicketTypes()
  const first = createUnit()
  const wanted = await fullPrice()
  const typeId = wanted.made ? await createTicketType(first.view(), { name: wanted.name, kind: 'standard', channel: 'all' }) : wanted.id
  const bandId = createBand(first.view(), production, { name: t('box-office.practice.band'), kind: 'standard' })
  const currency = await useSetting('core.locale.currency') as string
  await createPassType(first.view(), { name: t('box-office.practice.pass'), covers: 'productions', productionIds: [production], perShow: 'once', prices: [{ name: t('box-office.practice.pass-price'), amountMinor: PASS_PRICE }] }, currency, null)
  await first.commit()

  const second = createUnit()
  setPrices(second.view(), production, currency, [{ bandId, ticketTypeId: typeId, amountMinor: PRICE }], null)
  for (const night of nights) {
    const house = await houseOf(night)
    await saveSales(second.view(), night, { pools: [{ bandId, capacity: Math.min(house ?? MOST_SEATS, MOST_SEATS) }] }, useContext().actor)
  }
  await second.commit()
  // On sale only where the store has a way to pay, as payments.float gives it; the door needs neither.
  for (const night of nights) {
    const unit = createUnit()
    try {
      await openSales(unit.view(), night)
      await unit.commit()
    }
    catch (error) {
      if ((error as Error)?.name !== 'Refusal') throw error
    }
  }
  return { type: wanted.name }
}

type Plan = { cast: Person[], holder: Person, type: string, startsAt: { tonight: number, tomorrow: number }, seats: number }

function bookings({ cast, holder, type, startsAt, seats }: Plan): ImportBooking[] {
  const out: ImportBooking[] = []
  const book = (who: Person, at: number, tickets: ImportBooking['tickets'], code?: string) =>
    out.push({ reference: `PRAC-${String(out.length + 1).padStart(3, '0')}`, email: who.address, name: who.name, production: 'the-practice-play', startsAt: at, cancelled: false, tickets, ...code ? { code } : {} })
  const pair = (amountMinor: number) => [{ type, amountMinor }, { type, amountMinor }]
  let person = 0
  const next = () => cast[person++ % cast.length]!
  for (let i = 0; i < RESERVED; i++) book(next(), startsAt.tonight, pair(PRICE))
  book(holder, startsAt.tonight, [{ pass: PASS_CODE, amountMinor: 0 }])
  for (let left = Math.round(seats * SOLD) - RESERVED * 2 - 1; left > 0; left -= 2) book(next(), startsAt.tonight, left > 1 ? pair(0) : [{ type, amountMinor: 0 }])
  book(next(), startsAt.tomorrow, pair(0), TOMORROW_CODE)
  return out
}

export default definePracticeSample({
  after: ['core.tonight'],
  async seed(_unit, { results }) {
    const production = results.production!
    const nights = await all<{ id: string, starts_at: number }>('SELECT id, starts_at FROM core_performances WHERE id IN (?, ?) ORDER BY starts_at', results.tonight!, results.tomorrow!)
    const { type } = await setUp(production, nights.map(n => n.id))
    const cast = await people()
    const holder = cast.at(-1)!
    const pass = createUnit()
    await importPasses(pass.view(), [{ code: PASS_CODE, passType: t('box-office.practice.pass'), price: t('box-office.practice.pass-price'), email: holder.address, name: holder.name, paid: true }], false)
    await pass.commit()
    const seats = Math.min(await houseOf(results.tonight!) ?? MOST_SEATS, MOST_SEATS)
    const verdicts = await importShare({ importId: 'practice', bookings: bookings({ cast: cast.slice(0, -1), holder, type, startsAt: { tonight: nights[0]!.starts_at, tomorrow: nights[1]!.starts_at }, seats }) })
    const refused = verdicts.find(v => v.result === 'refused')
    if (refused) refuse('box-office.practice.not-seeded', `Practice booking ${refused.reference} could not be made: ${refused.reason}`, { status: 500 })
    return {}
  },
})
