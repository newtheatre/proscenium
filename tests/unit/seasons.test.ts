import { describe, expect, test } from 'bun:test'
import { archiveSeasonForm, saysOverlaps, seasonForm } from '#shared/utils/seasons'
import { seasonsList } from '#shared/utils/seasons-list'

// D-131's season form: a London day range, listed in date order (criterion 2, trimmed by issue 1352).

describe('a season needs a name and a real window', () => {
  test('a name and two civil days are required', () => {
    expect(seasonForm.safeParse({ name: 'Autumn 2026', startsOn: '2026-09-20', endsOn: '2026-12-10' }).success).toBe(true)
  })

  test('a day that is not YYYY-MM-DD is refused', () => {
    expect(seasonForm.safeParse({ name: 'Autumn 2026', startsOn: '20/09/2026', endsOn: '2026-12-10' }).success).toBe(false)
  })

  test('a season ends after it starts', () => {
    expect(seasonForm.safeParse({ name: 'Autumn 2026', startsOn: '2026-09-20', endsOn: '2026-09-20' }).success).toBe(false)
    expect(seasonForm.safeParse({ name: 'Autumn 2026', startsOn: '2026-09-20', endsOn: '2026-09-19' }).success).toBe(false)
  })

  // Issue 1352: the order field is gone; a season's place in the list is its dates.
  test('there is no order to give: the form takes a name and two days, nothing else', () => {
    expect(Object.keys(seasonForm.parse({ name: 'Autumn 2026', startsOn: '2026-09-20', endsOn: '2026-12-10' })).sort()).toEqual(['endsOn', 'name', 'startsOn'])
    expect(seasonForm.safeParse({ name: 'Autumn 2026', startsOn: '2026-09-20', endsOn: '2026-12-10', sort: 3 }).success).toBe(false)
  })

  test('the list opens in date order, with the name as the other way to read it', () => {
    expect(seasonsList.sort.default).toBe('startsOn')
    expect(seasonsList.sort.fields.map(field => field.key)).toEqual(['startsOn', 'name'])
  })
})

// Seasons are dated so they do not overlap, and a save names any it overlaps (0087).
describe('an overlap is guidance, never a refusal (issue 1352)', () => {
  test('the page words the seasons a save overlaps', () => {
    expect(saysOverlaps([])).toBeNull()
    expect(saysOverlaps(['Autumn 2026'])).toBe('Its days overlap Autumn 2026. The money dashboard counts a shared day in both.')
    expect(saysOverlaps(['Autumn 2026', 'StuFF 2027'])).toBe('Its days overlap Autumn 2026 and StuFF 2027. The money dashboard counts a shared day in both.')
  })
})

describe('retiring is its own action', () => {
  test('the archive form takes a plain boolean', () => {
    expect(archiveSeasonForm.parse({ archived: true })).toEqual({ archived: true })
    expect(archiveSeasonForm.safeParse({}).success).toBe(false)
  })
})

// 0087's words on the page, and one question per field (docs/copy-style.md section 8).
describe('the seasons and venues screens say what each field is for (issue 1352)', () => {
  test('seasons are the theatre\'s seasons, not committee years, and there is no order field', async () => {
    const source = await Bun.file('app/pages/box-office/seasons.vue').text()
    expect(source).not.toContain('committee years')
    expect(source).not.toContain('label="Order"')
  })

  test('the venue asks for the address for audiences, and the card for the address read to 999', async () => {
    expect(await Bun.file('app/pages/box-office/venues.vue').text()).toContain('label="Address for audiences"')
    const card = await Bun.file('app/pages/rota/manage/emergency.vue').text()
    expect(card).toContain('label="Address to read to 999"')
    expect(card).toContain('cardAddressDraft(')
    expect(card).not.toContain('Postal address')
  })
})
