import { describe, expect, test } from 'bun:test'
import { CONFIG_KEYS, CONFIG_KEY_NAMES, ENFORCED_KEYS, hasDefault, isSensitive } from '#shared/utils/config'
import { configChangeDetail } from '#shared/utils/config-audit'
import { configProblem } from '#shared/utils/config-rules'
import { isRecordable } from '#shared/utils/audit'
import type { ConfigKey } from '#shared/utils/config'

const shipped = (key: ConfigKey): unknown =>
  hasDefault(key) ? (CONFIG_KEYS[key] as { default: unknown }).default : undefined

describe('what a setting will accept (J-104 criterion 3)', () => {
  test('a value of the wrong shape is refused by the key own schema', () => {
    expect(configProblem('PASSWORD_MIN_LENGTH', 'twelve', shipped)).toBeTruthy()
    expect(configProblem('BAR_TAB_CAP_PENCE', -1, shipped)).toBeTruthy()
  })

  // The named refusal case: a yearly boundary must fall in every year (audit TR-7).
  test('29 February is refused as a yearly boundary, and says why', () => {
    const problem = configProblem('SEASON_START', '02-29', shipped)
    expect(problem).toContain('29 February')
  })

  test('the same rule catches every impossible date, not just that one', () => {
    expect(configProblem('SEASON_END', '04-31', shipped)).toBeTruthy()
    expect(configProblem('ACADEMIC_YEAR_BOUNDARY', '13-01', shipped)).toBeTruthy()
    expect(configProblem('ACADEMIC_YEAR_BOUNDARY', '02-28', shipped)).toBeNull()
  })

  test('a pair is checked against the other key as it stands', () => {
    expect(configProblem('TRAINING_FINAL_WARNING_DAYS', 90, shipped)).toContain('before')
    expect(configProblem('TRAINING_EXPIRY_WARNING_DAYS', 7, shipped)).toContain('after')
    expect(configProblem('ROOM_NO_SHOW_RECORD_AT', 9, shipped)).toContain('pre-approval')
    expect(configProblem('REGISTER_NAG_START_DAY', 90, shipped)).toContain('stop')
  })

  test('a pair that holds is accepted', () => {
    expect(configProblem('TRAINING_FINAL_WARNING_DAYS', 30, shipped)).toBeNull()
    expect(configProblem('ROOM_NO_SHOW_RECORD_AT', 3, shipped)).toBeNull()
  })

  test('every shipped default is a value the rules accept', () => {
    for (const key of CONFIG_KEY_NAMES) {
      if (!hasDefault(key)) continue
      expect(`${key}: ${configProblem(key, shipped(key), shipped)}`).toBe(`${key}: null`)
    }
  })
})

describe('what a settings change records (0011, 0024)', () => {
  test('an ordinary key records the values it moved between', async () => {
    const detail = await configChangeDetail('PASSWORD_MIN_LENGTH', 15, 20)
    expect(detail).toMatchObject({ key: 'PASSWORD_MIN_LENGTH', from: 15, to: 20 })
    expect(isRecordable(detail)).toBe(true)
  })

  // A recipients list is addresses, and audit detail carries identifiers rather than people.
  test('a key holding personal data records a hash instead', async () => {
    const detail = await configChangeDetail('NIGHT_REPORT_RECIPIENTS', [], ['duty@newtheatre.org.uk'])
    expect(detail).toMatchObject({ key: 'NIGHT_REPORT_RECIPIENTS', redacted: true })
    expect(JSON.stringify(detail)).not.toContain('duty@')
    expect(isRecordable(detail)).toBe(true)
  })

  test('the hash tells two values apart, and matches itself', async () => {
    const first = await configChangeDetail('NIGHT_REPORT_RECIPIENTS', [], ['a@b.co.uk'])
    const same = await configChangeDetail('NIGHT_REPORT_RECIPIENTS', [], ['a@b.co.uk'])
    const other = await configChangeDetail('NIGHT_REPORT_RECIPIENTS', [], ['c@d.co.uk'])

    expect(first.toHash).toBe(same.toHash as string)
    expect(first.toHash).not.toBe(other.toHash as string)
  })

  // Belt and braces: a key added later must not turn a settings change into a 500.
  test('no key can produce a detail the audit guard would refuse', async () => {
    for (const key of CONFIG_KEY_NAMES) {
      const detail = await configChangeDetail(key, shipped(key), shipped(key))
      expect(`${key}: ${isRecordable(detail)}`).toBe(`${key}: true`)
    }
  })

  test('the only key marked as holding personal data is the recipients list', () => {
    expect(CONFIG_KEY_NAMES.filter(isSensitive)).toEqual(['NIGHT_REPORT_RECIPIENTS'])
  })
})

describe('which settings the system actually enforces', () => {
  const source = [...new Bun.Glob('**/*.ts').scanSync({ cwd: 'server' })]
    .map(path => Bun.file(`server/${path}`).text())

  test('the enforced list is exactly what the server reads', async () => {
    const read = new Set<string>()
    for await (const text of source) {
      for (const [, key] of (await text).matchAll(/configValue\((?:event|undefined), '([A-Z0-9_]+)'\)/g)) {
        read.add(key!)
      }
    }

    expect([...read].sort()).toEqual([...ENFORCED_KEYS].sort())
  })
})
