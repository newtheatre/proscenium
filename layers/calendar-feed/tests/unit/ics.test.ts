// The calendar file's text rules (RFC 5545): escaped property text and lines folded at 75 bytes.
import { describe, expect, it } from 'vitest'
import { escape, fold } from '../../server/ics'

describe('a calendar file', () => {
  it('escapes backslashes, semicolons, commas and line breaks', () => {
    expect(escape('Bar; front, back\\side\nnext')).toBe('Bar\\; front\\, back\\\\side\\nnext')
  })
  it('folds a long line at 75 bytes, never inside a character', () => {
    const line = `SUMMARY:${'é'.repeat(60)}`
    const folded = fold(line).split('\r\n')
    expect(folded.length).toBeGreaterThan(1)
    for (const part of folded) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    expect(folded.map((p, i) => i ? p.slice(1) : p).join('')).toBe(line)
  })
})
