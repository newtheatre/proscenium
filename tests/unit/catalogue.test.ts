import { describe, expect, test } from 'bun:test'
import { CatalogueParseError, parseCatalogue, parseCsv, parseExpiry, readCatalogue } from '../../scripts/lib/catalogue'

// The draft catalogue is the subcommittee's spreadsheet, so a cell it cannot read is a hard
// failure naming the cell rather than a module quietly missing from the seed.

// The real file's columns, in its order, so a row here is a row the subcommittee could paste.
const HEADER = 'Department,ID,Name,Description,Prerequisites,Old Module(s),Proposed Expiry,Materials Link,Safety Critical,Grants,Status,Notes'
const row = (cells: string): string => `${HEADER}\n${cells}`

describe('the CSV reader', () => {
  test('a quoted field keeps its commas, its quotes and its newlines', () => {
    expect(parseCsv('a,"b,c","d""e","f\ng"')).toEqual([['a', 'b,c', 'd"e', 'f\ng']])
  })

  test('a byte order mark does not become part of the first column name', () => {
    expect(parseCsv('﻿Department,ID')[0]).toEqual(['Department', 'ID'])
  })
})

describe('the expiry column', () => {
  test('the shapes the draft uses', () => {
    expect(parseExpiry('Never')).toMatchObject({ expiryMode: 'NONE', expiryMonths: null })
    expect(parseExpiry('')).toMatchObject({ expiryMode: 'NONE' })
    expect(parseExpiry('Academic year')).toMatchObject({ expiryMode: 'ACADEMIC_YEAR' })
    expect(parseExpiry('36 months')).toMatchObject({ expiryMode: 'MONTHS', expiryMonths: 36 })
    expect(parseExpiry('3 years')).toMatchObject({ expiryMode: 'MONTHS', expiryMonths: 36 })
    expect(parseExpiry('Brief (recurring)')).toMatchObject({ isBrief: true })
  })

  // The certificate carries its own date, so the module imposes none (G-121 criterion 3).
  test('an external certificate date is no policy of the module', () => {
    expect(parseExpiry('External cert date')).toMatchObject({ expiryMode: 'NONE', expiryMonths: null })
  })

  test('anything else is refused rather than guessed', () => {
    expect(parseExpiry('sometimes')).toBeNull()
    expect(parseExpiry('0 months')).toBeNull()
  })
})

describe('a row becomes a module', () => {
  test('kind is derived from the id and the expiry, never typed', () => {
    const parsed = parseCatalogue(row(
      'TECH,TECH-111,Lighting,,,,Never,,,,ACTIVE,\n'
      + 'TECH,LD-CERT,Lighting Designer,,,,Academic year,,,trainer,ACTIVE,\n'
      + 'STGE,STGE-105,Get-in brief,,,,Brief (recurring),,,,ACTIVE,',
    ))
    expect(parsed.map(module => module.kind)).toEqual(['MODULE', 'CERTIFICATION', 'BRIEF'])
  })

  test('a certification signs off and may confer standing', () => {
    const [cert] = parseCatalogue(row('TECH,LD-CERT,Lighting Designer,,,,Never,,,supervisor trainer,ACTIVE,'))
    expect(cert).toMatchObject({ signoffRequired: true, grantsSupervisor: true, grantsTrainer: true })
  })

  test('a brief carries no lifetime, whatever the column says', () => {
    const [brief] = parseCatalogue(row('STGE,STGE-105,Get-in,,,,Brief (recurring),,,,ACTIVE,'))
    expect(brief).toMatchObject({ kind: 'BRIEF', expiryMode: 'NONE', expiryMonths: null })
  })

  test('only a certification confers standing', () => {
    expect(() => parseCatalogue(row('TECH,TECH-111,Lighting,,,,Never,,,trainer,ACTIVE,')))
      .toThrow(/only a certification confers standing/)
  })

  test('a department that disagrees with the id prefix is a typo, not a choice', () => {
    expect(() => parseCatalogue(row('STGE,TECH-111,Lighting,,,,Never,,,,ACTIVE,')))
      .toThrow(CatalogueParseError)
  })

  test('a prerequisite that resolves nowhere is refused by name', () => {
    expect(() => parseCatalogue(row('TECH,TECH-111,Lighting,,TECH-999,,Never,,,,ACTIVE,')))
      .toThrow(/unknown prerequisite "TECH-999"/)
  })

  test('a materials link that is not https is refused', () => {
    expect(() => parseCatalogue(row('TECH,TECH-111,Lighting,,,,Never,http://drive.example,,,ACTIVE,')))
      .toThrow(CatalogueParseError)
  })

  // Decision 0114: a column the subcommittee's older sheets do not have reads as open to everybody.
  test('the committee-only column reads yes and no, and its absence as no', () => {
    const withColumn = `${HEADER},Committee Only\n`
      + 'ADMN,ADMN-201,Committee Operations,,,,Academic year,,,,ACTIVE,,yes\n'
      + 'ADMN,ADMN-102,Selling Alcohol,,,,Academic year,,,,ACTIVE,,no'
    expect(parseCatalogue(withColumn).map(module => [module.id, module.committeeOnly])).toEqual([['ADMN-201', true], ['ADMN-102', false]])
    expect(parseCatalogue(row('ADMN,ADMN-201,Committee Operations,,,,Academic year,,,,ACTIVE,'))[0]!.committeeOnly).toBe(false)
  })

  test('a committee-only value that is neither yes nor no is refused by cell', () => {
    expect(() => parseCatalogue(`${HEADER},Committee Only\nADMN,ADMN-201,Committee Operations,,,,Never,,,,ACTIVE,,sometimes`))
      .toThrow(/"Committee Only": unrecognised value "sometimes"/)
  })

  test('a duplicate id is refused, because the second would overwrite the first', () => {
    expect(() => parseCatalogue(row(
      'TECH,TECH-111,Lighting,,,,Never,,,,ACTIVE,\nTECH,TECH-111,Lighting again,,,,Never,,,,ACTIVE,',
    ))).toThrow(/duplicate id/)
  })
})

// The 26 September training decisions as the file carries them (0114, issues 1532 and 1544).
describe('the draft catalogue itself', () => {
  test('front of house management comes before the door, the bar and the duty manager', async () => {
    const byId = new Map((await readCatalogue()).map(module => [module.id, module]))
    for (const id of ['ADMN-102', 'ADMN-103', 'ADMN-201']) expect(byId.get(id)!.prerequisites).toContain('ADMN-101')
  })

  test('the committee\'s own module is committee-only, and selling alcohol is not', async () => {
    const byId = new Map((await readCatalogue()).map(module => [module.id, module]))
    expect(byId.get('ADMN-201')!.committeeOnly).toBe(true)
    expect(byId.get('ADMN-102')!.committeeOnly).toBe(false)
    expect([...byId.values()].filter(module => module.committeeOnly).map(module => module.id)).toEqual(['ADMN-201'])
  })

  test('no note names a retired role', async () => {
    const notes = (await readCatalogue()).map(module => module.notes ?? '').join('\n')
    expect(notes).not.toMatch(/FRONT_OF_HOUSE|BOX_OFFICE/)
  })
})
