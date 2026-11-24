// What a message says about a room booking: the room, the day, the times and its title, in the
// theatre's own time zone and language.
import { first, theatreTimeZone, useSetting, wordsFrom } from '#kit'
import { placeOf } from '#modules/core'
import catalogue from '../i18n/en-GB.json'

const say = wordsFrom(catalogue)

export type BookingWords = { room: string, date: string, when: string, title: string }

export async function bookingWords(id: string): Promise<BookingWords> {
  const row = (await first<{ starts_at: number, ends_at: number, title: string, name: string | null, space: string | null, venue: string | null }>(
    `SELECT b.starts_at, b.ends_at, b.title, k.name, s.name AS space, v.name AS venue FROM spaces_bookings b JOIN spaces_bookables k ON k.id = b.bookable_id
      LEFT JOIN core_spaces s ON s.id = k.space_id LEFT JOIN core_venues v ON v.id = s.venue_id WHERE b.id = ?`, id))!
  const locale = (await useSetting('core.locale.language') as string | null) ?? 'en-GB'
  const timeZone = await theatreTimeZone()
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone })
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone })
  return {
    room: row.space && row.venue ? placeOf(row.space, row.venue) : row.name ?? '',
    date: date.format(row.starts_at),
    when: say('spaces.words.when', { from: time.format(row.starts_at), to: time.format(row.ends_at) }),
    title: row.title,
  }
}
