import { describe, expect, test } from 'bun:test'
import { ProductionRefusal, assertLocalTarget, assertNotProduction, generatePassword, syntheticPerson } from '#tests/helpers/seed'

describe('seed tooling refuses production (K-120)', () => {
  test('local targets are allowed', () => {
    for (const target of [':memory:', '.data/db/sqlite.db', '/tmp/scratch.db']) {
      expect(() => assertLocalTarget(target)).not.toThrow()
    }
  })

  test('a remote or production target is refused', () => {
    for (const target of [
      'newtheatre.org.uk',
      'https://api.cloudflare.com/d1/unified',
      'nnt-unified.workers.dev',
      'unified',
      '/var/lib/production.db',
    ]) {
      expect(() => assertLocalTarget(target)).toThrow(ProductionRefusal)
    }
  })

  test('NODE_ENV=production is refused outright', () => {
    expect(() => assertNotProduction('production')).toThrow(ProductionRefusal)
    expect(() => assertNotProduction('development')).not.toThrow()
    expect(() => assertNotProduction(undefined)).not.toThrow()
  })
})

describe('seeded people are obviously synthetic', () => {
  test('every address is on a reserved undeliverable domain', () => {
    for (let i = 0; i < 40; i++) {
      expect(syntheticPerson(i).email.endsWith('.invalid')).toBe(true)
    }
  })

  test('every name is marked as test data', () => {
    for (let i = 0; i < 40; i++) {
      expect(syntheticPerson(i).name).toContain('(test)')
    }
  })

  test('no address could belong to a real member', () => {
    for (let i = 0; i < 40; i++) {
      expect(syntheticPerson(i).email).not.toContain('newtheatre.org.uk')
    }
  })

  test('passwords are generated at run time, never fixed', () => {
    expect(generatePassword()).not.toBe(generatePassword())
  })
})
