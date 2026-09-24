import { describe, expect, test } from 'bun:test'
import { currentValue, priorValueFromDetail, writeConfigValue } from '#server/utils/config-write'
import type { H3Event } from 'h3'

// J-105 criterion 3: a revert reads the trail rather than a second history table. The parsing
// that makes that safe, proved without a database.

describe('priorValueFromDetail reads a revert target off the trail (criterion 3)', () => {
  test('an ordinary change detail yields the value it moved from', () => {
    expect(priorValueFromDetail({ changes: { value: { from: false } } })).toEqual({ value: false })
  })

  test('a falsy prior value is still a real value, not treated as absent', () => {
    expect(priorValueFromDetail({ changes: { value: { from: 0 } } })).toEqual({ value: 0 })
    expect(priorValueFromDetail({ changes: { value: { from: null } } })).toEqual({ value: null })
  })

  test('a redacted detail, a sensitive key\'s own shape, has nothing to revert to', () => {
    expect(priorValueFromDetail({ redacted: true })).toBeNull()
  })

  test('no detail at all, a key that has never changed, has nothing to revert to', () => {
    expect(priorValueFromDetail(null)).toBeNull()
    expect(priorValueFromDetail(undefined)).toBeNull()
  })

  test('a detail carrying no changes shape at all is refused the same way', () => {
    expect(priorValueFromDetail({})).toBeNull()
  })
})

describe('currentValue reads an override, or the default it ships with', () => {
  test('an overridden key reads its override, never the default beside it', () => {
    expect(currentValue('RETENTION_ARMED', new Map([['RETENTION_ARMED', true]]))).toBe(true)
  })

  test('a key with no override falls back to its shipped default', () => {
    expect(currentValue('RETENTION_ARMED', new Map())).toBe(false)
  })
})

// C-121 criterion 4, 0092: the list is gov.uk's, so a save and a revert, which share this path,
// are both refused before anything is read or written.
describe('a synced key is refused by the write path (0092)', () => {
  test('BANK_HOLIDAYS cannot be written by a person, whatever the value', async () => {
    const event = { context: {} } as unknown as H3Event
    const refused = await writeConfigValue(event, 'u-officer', 'BANK_HOLIDAYS', ['2026-12-25']).catch(error => error as { statusCode: number, statusMessage: string })

    expect(refused).toMatchObject({ statusCode: 409 })
    expect((refused as { statusMessage: string }).statusMessage).toContain('gov.uk')
  })
})
