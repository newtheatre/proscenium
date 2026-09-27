import { describe, expect, test } from 'bun:test'

// A correlated subquery's own aliases shadow its caller's, which is how a party once read the whole
// house (#1295). So every table the capacity counts open carries an alias no caller would use.

describe('the capacity counts alias privately (#1295)', () => {
  test('every alias in server/utils/capacity.ts carries a prefix, never a bare letter', async () => {
    const source = await Bun.file('server/utils/capacity.ts').text()
    // Case-sensitive, so a lowercase "from" in a comment is never read as SQL. A comma join's
    // second table is not caught; the file has none.
    const aliases = [...source.matchAll(/\b(?:FROM|JOIN)\s+(?:\$\{[^}]*\}|"?\w+"?)\s+(?:AS\s+)?(\w+)/g)]
      .map(match => match[1]!)
      .filter(alias => !/^(?:WHERE|ON|LIMIT|GROUP|ORDER|LEFT|INNER|CROSS|JOIN)$/.test(alias))
    expect(aliases.length).toBeGreaterThan(10)
    expect(aliases.filter(alias => !/^[a-z]{3,}_[a-z]+$/.test(alias))).toEqual([])
  })
})
