import { describe, expect, test } from 'bun:test'

// A correlated subquery's own aliases shadow its caller's, which is how a party once read the whole
// house (#1295). So every table the capacity counts open carries an alias no caller would use.

describe('the capacity counts alias privately (#1295)', () => {
  test('every table opened in server/utils/capacity.ts is aliased with a prefix, never a bare letter', async () => {
    const source = await Bun.file('server/utils/capacity.ts').text()
    const aliases = [...source.matchAll(/\b(?:FROM|JOIN)\s+(?:\$\{sql\.raw\([A-Z_]+\)\}|[a-z_]+)\s+([a-z][a-z0-9_]*)\b/g)]
      .map(match => match[1]!)
    expect(aliases.length).toBeGreaterThan(10)
    expect(aliases.filter(alias => !alias.includes('_'))).toEqual([])
  })
})
