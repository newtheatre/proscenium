import { describe, expect, test } from 'bun:test'
import {
  MAX_PASS_PRICE_PENCE,
  coverPresetOn,
  newPassTypeForm,
  passTypeForm,
  passTypeShowsForm,
  saysPassTypeStatus,
} from '#shared/utils/pass-types'
import { publishShowForm } from '#shared/utils/programme'

// D-123's vocabulary: a pass product's window, its price points and the shows it covers.

const base = {
  name: 'Season pass',
  slug: 'season-pass',
  validFrom: 1_800_000_000,
  validUntil: 1_810_000_000,
  prices: [{ label: 'Standard', price: 4500 }],
  showIds: ['show-1'],
}

describe('a pass has a validity window, price points and covered shows (criterion 1)', () => {
  test('a well formed pass is accepted', () => {
    expect(newPassTypeForm.safeParse(base).success).toBe(true)
  })

  test('a pass cannot expire before it starts', () => {
    expect(newPassTypeForm.safeParse({ ...base, validFrom: base.validUntil, validUntil: base.validFrom }).success)
      .toBe(false)
  })

  test('sales cannot close before they open', () => {
    expect(newPassTypeForm.safeParse({ ...base, salesOpenAt: 2_000, salesCloseAt: 1_000 }).success).toBe(false)
    expect(newPassTypeForm.safeParse({ ...base, salesOpenAt: 1_000, salesCloseAt: 2_000 }).success).toBe(true)
  })

  test('a pass needs at least one price point, and each needs its own label', () => {
    expect(newPassTypeForm.safeParse({ ...base, prices: [] }).success).toBe(false)
    expect(newPassTypeForm.safeParse({
      ...base,
      prices: [{ label: 'Standard', price: 1000 }, { label: 'standard', price: 500 }],
    }).success).toBe(false)
  })

  test('a price in pence is taken, a fractional or absurd one is not', () => {
    expect(newPassTypeForm.safeParse({ ...base, prices: [{ label: 'Half', price: 7.5 }] }).success).toBe(false)
    expect(newPassTypeForm.safeParse({ ...base, prices: [{ label: 'Wrong', price: MAX_PASS_PRICE_PENCE + 1 }] }).success)
      .toBe(false)
  })

  test('a pass needs to cover at least one show, and a show is covered once', () => {
    expect(newPassTypeForm.safeParse({ ...base, showIds: [] }).success).toBe(false)
    expect(newPassTypeForm.safeParse({ ...base, showIds: ['show-1', 'show-1'] }).success).toBe(false)
  })
})

describe('the cap is an explicit number, uncapped otherwise (criterion 2)', () => {
  test('no cap is fine, a positive one is taken, nought or negative is not', () => {
    expect(newPassTypeForm.safeParse({ ...base, maxIssued: null }).success).toBe(true)
    expect(newPassTypeForm.safeParse({ ...base, maxIssued: 200 }).success).toBe(true)
    expect(newPassTypeForm.safeParse({ ...base, maxIssued: 0 }).success).toBe(false)
    expect(newPassTypeForm.safeParse({ ...base, maxIssued: -1 }).success).toBe(false)
  })
})

describe('covered shows move through their own form (criterion 4)', () => {
  test('the edit form takes a status but no shows', () => {
    const { showIds: _showIds, ...withoutShows } = base
    const edited = passTypeForm.parse({ ...withoutShows, status: 'ON_SALE' })
    expect('showIds' in edited).toBe(false)
    expect(edited.status).toBe('ON_SALE')
  })

  test('an unrecognised status is refused', () => {
    expect(passTypeForm.safeParse({ ...base, status: 'ARCHIVED' }).success).toBe(false)
  })

  test('the shows form takes the full covered set, deduplicated and non-empty', () => {
    expect(passTypeShowsForm.safeParse({ showIds: [] }).success).toBe(false)
    expect(passTypeShowsForm.parse({ showIds: ['show-1', 'show-2'] }).showIds).toEqual(['show-1', 'show-2'])
  })
})

describe('what a screen says', () => {
  test('a status reads as English', () => {
    expect(saysPassTypeStatus('DRAFT')).toBe('Draft')
    expect(saysPassTypeStatus('ON_SALE')).toBe('On sale')
    expect(saysPassTypeStatus('CLOSED')).toBe('Closed')
  })
})

// D-123 criterion 8, issue 1151 item 10: covered shows are changed by their own action, and the
// edit form hid them, so a pass being edited read as one covering nothing.
describe('the covered shows are named on the edit form, read-only', () => {
  const SCREEN = 'app/pages/box-office/pass-types.vue'

  test('the edit form carries a read-only line for what the pass covers', async () => {
    expect(await Bun.file(SCREEN).text()).toContain('pass-type-shows-fixed')
  })

  test('that line says where the covered shows are changed instead', async () => {
    expect(await Bun.file(SCREEN).text()).toContain('Covered shows')
  })
})

// One name for one list: the button said "Shows", the form "Covers" and the help "Covered shows"
// (issue 1323, D-123 criterion 4).
describe('the covered shows have one name (issue 1323)', () => {
  const SCREEN = 'app/pages/box-office/pass-types.vue'

  test('neither "Covers" nor a bare "Shows" labels them any more', async () => {
    const source = await Bun.file(SCREEN).text()
    expect(source).not.toMatch(/label="Covers"|header: 'Covers'|\(\) => 'Shows'|aria-label="Shows"/)
  })

  test('the footer counts passes, never "passs"', async () => {
    const source = await Bun.file(SCREEN).text()
    expect(source).not.toMatch(/plural\([^,]+, 'pass'\)/)
  })
})

// A word ending in s, x, ch or sh takes "es", which plural() cannot guess, so every such call names
// its plural (issue 1323: the pass list read "3 passs").
describe('no count on a screen doubles its s', () => {
  test('every plural() of a sibilant word names its plural form', async () => {
    const offenders: string[] = []
    for (const root of ['app', 'shared', 'server']) {
      for await (const file of new Bun.Glob('**/*.{ts,vue}').scan(root)) {
        const source = await Bun.file(`${root}/${file}`).text()
        for (const match of source.matchAll(/plural\([^()]*?, '([^']*(?:s|x|ch|sh))'\)/g)) {
          offenders.push(`${root}/${file}: ${match[0]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

// A show playing only at venues we run is ours, so the publish sheet ticks each covering pass for
// it; a visiting or external night starts unticked (issue 1323).
describe('the publish sheet presets the cover for an in-house show (issue 1323)', () => {
  const at = (isExternal: boolean, status = 'ON_SALE') => ({ status, isExternal })

  test('every uncancelled performance at a venue we run presets the tick on', () => {
    expect(coverPresetOn([at(false), at(false), at(true, 'CANCELLED')])).toBe(true)
  })

  test('any uncancelled performance at an external venue, or none at all, presets it off', () => {
    expect(coverPresetOn([at(false), at(true)])).toBe(false)
    expect(coverPresetOn([at(false, 'CANCELLED')])).toBe(false)
    expect(coverPresetOn([])).toBe(false)
  })

  test('publishing may name the passes to add the show to, and names none by default', () => {
    expect(publishShowForm.parse({ published: true }).coverPassTypeIds).toEqual([])
    expect(publishShowForm.parse({ published: true, coverPassTypeIds: ['pt-1'] }).coverPassTypeIds).toEqual(['pt-1'])
    expect(publishShowForm.safeParse({ published: true, coverPassTypeIds: [''] }).success).toBe(false)
  })
})
