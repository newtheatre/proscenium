import { describe, expect, test } from 'bun:test'
import { saysRoomSpan, saysTimes } from '#shared/utils/room-messages'
import { asSentence } from '#shared/utils/text'

const seconds = (iso: string): number => Math.floor(new Date(iso).getTime() / 1000)

describe('a rooms email says the slot from start to end (process map, rooms)', () => {
  test('one day is said once, with both times and the year', () => {
    expect(saysRoomSpan(seconds('2026-10-29T18:00:00Z'), seconds('2026-10-29T19:00:00Z')))
      .toBe('Thursday 29 October 2026, 18:00 to 19:00')
  })

  test('a slot in summer time is said in London time too', () => {
    expect(saysRoomSpan(seconds('2026-10-22T17:00:00Z'), seconds('2026-10-22T18:00:00Z')))
      .toBe('Thursday 22 October 2026, 18:00 to 19:00')
  })

  test('a span over two days names both days', () => {
    expect(saysRoomSpan(seconds('2026-11-05T09:00:00Z'), seconds('2026-11-06T18:00:00Z')))
      .toBe('Thursday 5 November 2026, 09:00 to Friday 6 November 2026, 18:00')
  })

  test('the times alone', () => {
    expect(saysTimes(seconds('2026-10-29T18:00:00Z'), seconds('2026-10-29T19:30:00Z'))).toBe('18:00 to 19:30')
  })
})

describe('asSentence (process map, rooms)', () => {
  test('a reason with no full stop gets one', () => {
    expect(asSentence('Get-in for the December show')).toBe('Get-in for the December show.')
  })

  test('a reason that already ends a sentence is left as typed', () => {
    for (const ended of ['short notice.', 'Really?', 'Fire alarm!', 'They said "no."', 'Wait…', '(see the rota.)']) {
      expect(asSentence(ended)).toBe(ended)
    }
  })

  test('the escaped quote of the HTML part counts as a quote', () => {
    expect(asSentence('They said &quot;no.&quot;')).toBe('They said &quot;no.&quot;')
  })

  test('surrounding space is dropped, and nothing stays nothing', () => {
    expect(asSentence('  short notice  ')).toBe('short notice.')
    expect(asSentence('   ')).toBe('')
  })
})
