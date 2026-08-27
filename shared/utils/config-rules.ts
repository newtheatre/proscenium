import { CONFIG_KEYS } from './config'
import type { ConfigKey } from './config'

// A value is refused before it is stored, and the refusal names the rule (J-104 criterion 3).
// Shape comes from the key's own schema; this is what a schema on one key cannot see.

// A boundary written as MM-DD has to exist in every year, so February stops at the 28th: 29
// February is a boundary that is absent three years in four (audit TR-7).
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const DAY_OF_YEAR_KEYS = ['SEASON_START', 'SEASON_END', 'ACADEMIC_YEAR_BOUNDARY'] as const

function dayOfYearProblem(value: string): string | null {
  const [month, day] = value.split('-').map(Number)
  if (!month || !day || month < 1 || month > 12) return 'That is not a month and a day'

  const limit = DAYS_IN_MONTH[month - 1]!
  if (day < 1 || day > limit) {
    return month === 2 && day === 29
      ? 'A yearly boundary must fall in every year, and 29 February does not'
      : `There is no day ${day} in month ${month}`
  }
  return null
}

// Reads the value of another key as it will stand after this change, so a pair can be checked
// against each other rather than each against nothing.
export type ConfigLookup = (key: ConfigKey) => unknown

interface Pair {
  key: ConfigKey
  other: ConfigKey
  holds: (value: number, other: number) => boolean
  says: string
}

// Only pairs a schema cannot already refuse: the password lengths, for instance, have ranges
// that cannot cross, so a rule for them would be a branch no input can reach.
const PAIRS: Pair[] = [
  {
    key: 'TRAINING_FINAL_WARNING_DAYS',
    other: 'TRAINING_EXPIRY_WARNING_DAYS',
    holds: (final, first) => final <= first,
    says: 'The final warning cannot come before the first one',
  },
  {
    key: 'TRAINING_EXPIRY_WARNING_DAYS',
    other: 'TRAINING_FINAL_WARNING_DAYS',
    holds: (first, final) => first >= final,
    says: 'The first warning cannot come after the final one',
  },
  {
    key: 'ROOM_NO_SHOW_RECORD_AT',
    other: 'ROOM_NO_SHOW_PREAPPROVAL_AT',
    holds: (record, preapproval) => record <= preapproval,
    says: 'A no-show has to be recorded before it can require pre-approval',
  },
  {
    key: 'ROOM_NO_SHOW_PREAPPROVAL_AT',
    other: 'ROOM_NO_SHOW_RECORD_AT',
    holds: (preapproval, record) => preapproval >= record,
    says: 'Pre-approval cannot start before no-shows are recorded',
  },
  {
    key: 'REGISTER_NAG_START_DAY',
    other: 'REGISTER_NAG_STOP_DAYS',
    holds: (start, stop) => start <= stop,
    says: 'The nags cannot start after they stop',
  },
]

export function configProblem(key: ConfigKey, value: unknown, lookup: ConfigLookup): string | null {
  const parsed = CONFIG_KEYS[key].schema.safeParse(value)
  if (!parsed.success) return `That is not a valid value for ${key}`

  if ((DAY_OF_YEAR_KEYS as readonly string[]).includes(key)) {
    const problem = dayOfYearProblem(value as string)
    if (problem) return problem
  }

  for (const pair of PAIRS) {
    if (pair.key !== key) continue
    const other = lookup(pair.other)
    if (typeof other === 'number' && typeof value === 'number' && !pair.holds(value, other)) return pair.says
  }

  return null
}
