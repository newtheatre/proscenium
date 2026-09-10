import { describe, expect, test } from 'bun:test'
import { MAX_BOUND_PARAMETERS } from '#tests/helpers/database'
import {
  DEFAULT_ANY_CAP,
  conditionsOf,
  encodeCondition,
  fieldOf,
  filterQuerySchema,
  maxBoundParameters,
  operatorsOf,
  parseCondition,
  saysCondition,
} from '#shared/utils/list-filters'
import { accountsList } from '#shared/utils/accounts-list'
import { showsList } from '#shared/utils/shows-list'
import type { FilterField, ListSpec } from '#shared/utils/list-filters'

// One declaration derives the query schema, the builder and the chips (K-129 criterion 1, 0032).
// What the predicates do against real rows is tests/integration/list-filters.test.ts.

const field = (over: Partial<FilterField> & Pick<FilterField, 'key' | 'kind'>): FilterField => ({
  label: over.key,
  ...over,
})

const spec: ListSpec = {
  key: 'things',
  search: { placeholder: 'A name', maxLength: 50 },
  fields: [
    field({ key: 'colour', kind: 'list', column: 'colour', options: [{ value: 'RED', label: 'Red' }, { value: 'BLUE', label: 'Blue' }], cap: 2 }),
    field({ key: 'owner', kind: 'person' }),
    field({ key: 'seenOn', kind: 'date-range', column: 'seen_on' }),
    field({ key: 'weight', kind: 'number-range', column: 'weight' }),
    field({ key: 'live', kind: 'yes-no', column: 'live' }),
  ],
  sort: {
    fields: [{ key: 'name', label: 'Name', column: 'name' }, { key: 'seenOn', label: 'Seen', column: 'seen_on' }],
    default: 'name',
  },
}

const parse = (query: Record<string, string>) => filterQuerySchema(spec).safeParse(query)

describe('the schema is derived from the declaration (criterion 1)', () => {
  test('an empty query is the first page, the default sort and no conditions', () => {
    const parsed = parse({})
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.page).toBe(1)
    expect(parsed.data.sort).toBe('name')
    expect(parsed.data.direction).toBe('asc')
    expect(conditionsOf(spec, parsed.data)).toEqual([])
  })

  test('a field is read as one condition carrying its operator and values', () => {
    const parsed = parse({ colour: 'is:RED', seenOn: 'between:2026-01-01,2026-01-31', live: 'true' })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(conditionsOf(spec, parsed.data)).toEqual([
      { key: 'colour', operator: 'is', values: ['RED'] },
      { key: 'seenOn', operator: 'between', values: ['2026-01-01', '2026-01-31'] },
      { key: 'live', operator: 'is', values: ['true'] },
    ])
  })

  test('a closed list refuses a value it does not declare', () => {
    expect(parse({ colour: 'is:GREEN' }).success).toBe(false)
    expect(parse({ colour: 'any:RED,GREEN' }).success).toBe(false)
  })

  test('an operator the kind does not offer is refused', () => {
    expect(parse({ live: 'not:true' }).success).toBe(false)
    expect(parse({ colour: 'before:RED' }).success).toBe(false)
    expect(parse({ owner: 'between:a,b' }).success).toBe(false)
  })

  test('a date must be a real day and a range must run forwards', () => {
    expect(parse({ seenOn: 'before:2026-02-30' }).success).toBe(false)
    expect(parse({ seenOn: 'before:yesterday' }).success).toBe(false)
    expect(parse({ seenOn: 'between:2026-02-01,2026-01-01' }).success).toBe(false)
    expect(parse({ seenOn: 'after:2026-02-28' }).success).toBe(true)
  })

  test('a number must be a number and a range must run upwards', () => {
    expect(parse({ weight: 'is:heavy' }).success).toBe(false)
    expect(parse({ weight: 'between:10,5' }).success).toBe(false)
    expect(parse({ weight: 'between:5,10' }).success).toBe(true)
    expect(parse({ weight: 'after:-3.5' }).success).toBe(true)
  })

  test('a yes or no takes only yes or no', () => {
    expect(parse({ live: 'is:maybe' }).success).toBe(false)
    const parsed = parse({ live: '0' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(conditionsOf(spec, parsed.data)).toEqual([{ key: 'live', operator: 'is', values: ['false'] }])
  })

  test('empty takes no value and everything else needs one', () => {
    expect(parse({ colour: 'empty' }).success).toBe(true)
    expect(parse({ colour: 'is' }).success).toBe(false)
    expect(parse({ colour: 'is:' }).success).toBe(false)
    expect(parse({ colour: '' }).success).toBe(true)
  })

  test('the search box is trimmed and capped at the declared length', () => {
    const parsed = parse({ search: '  ivy  ' })
    if (parsed.success) expect(parsed.data.search).toBe('ivy')
    expect(parse({ search: 'x'.repeat(51) }).success).toBe(false)
  })

  test('paging comes from the shared page query', () => {
    expect(parse({ pageSize: '5000' }).success).toBe(false)
    expect(parse({ page: '0' }).success).toBe(false)
  })

  // An obsolete link is told so, rather than shown a plausible listing with no chip.
  test('a key the list does not declare is refused, not stripped', () => {
    expect(parse({ filter: 'anonymised' }).success).toBe(false)
    expect(parse({ colour: 'is:RED', extra: '1' }).success).toBe(false)
  })
})

describe('sorting is by a declared field only (criterion 5)', () => {
  test('a declared sort key and direction are accepted', () => {
    const parsed = parse({ sort: 'seenOn', direction: 'desc' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect([parsed.data.sort, parsed.data.direction]).toEqual(['seenOn', 'desc'])
  })

  test('a column that is not declared cannot be sorted by, however real it is', () => {
    expect(parse({ sort: 'colour' }).success).toBe(false)
    expect(parse({ sort: 'id; drop table things' }).success).toBe(false)
    expect(parse({ direction: 'sideways' }).success).toBe(false)
  })
})

describe('an "is any of" list is capped so no statement grows with the data (criterion 5, 0006)', () => {
  test('a list up to the cap is accepted and one past it is refused', () => {
    expect(parse({ colour: 'any:RED,BLUE' }).success).toBe(true)
    expect(parse({ colour: 'any:RED,BLUE,RED' }).success).toBe(false)
  })

  test('a field with no cap of its own takes the default', () => {
    const many = Array.from({ length: DEFAULT_ANY_CAP }, (_, index) => `person-${index}`)
    expect(parse({ owner: `any:${many.join(',')}` }).success).toBe(true)
    expect(parse({ owner: `any:${[...many, 'one-more'].join(',')}` }).success).toBe(false)
  })

  test('the worst case for a declaration is the sum of its caps, and stays inside the chunk limit', () => {
    // Search binds one per column at most three, paging binds two, and each condition binds up
    // to its cap: the bound is a property of the declaration, never of the rows.
    expect(maxBoundParameters(spec)).toBe(2 + 2 + DEFAULT_ANY_CAP + 2 + 2 + 1 + 3)
    for (const declared of [accountsList, showsList]) {
      expect(maxBoundParameters(declared)).toBeLessThan(MAX_BOUND_PARAMETERS)
    }
  })
})

describe('the operators fit the kind (criterion 3)', () => {
  test('each kind offers the operators that make sense for it', () => {
    expect(operatorsOf(field({ key: 'a', kind: 'list' }))).toEqual(['is', 'not', 'any', 'empty'])
    expect(operatorsOf(field({ key: 'a', kind: 'yes-no' }))).toEqual(['is'])
    expect(operatorsOf(field({ key: 'a', kind: 'date-range' }))).toEqual(['is', 'before', 'after', 'between', 'empty'])
    expect(operatorsOf(field({ key: 'a', kind: 'number-range' }))).toEqual(['is', 'before', 'after', 'between', 'empty'])
    expect(operatorsOf(field({ key: 'a', kind: 'person' }))).toEqual(['is', 'not', 'any', 'empty'])
  })

  test('a field may narrow its operators but never widen them', () => {
    expect(operatorsOf(field({ key: 'a', kind: 'list', operators: ['is'] }))).toEqual(['is'])
    expect(() => operatorsOf(field({ key: 'a', kind: 'yes-no', operators: ['between'] }))).toThrow()
  })
})

describe('a condition round-trips through the URL (criterion 4)', () => {
  test('encoding and parsing are inverses', () => {
    for (const raw of ['is:RED', 'not:BLUE', 'any:RED,BLUE', 'empty']) {
      const parsed = parseCondition(spec.fields[0]!, raw)
      expect('condition' in parsed).toBe(true)
      if ('condition' in parsed) expect(encodeCondition(parsed.condition)).toBe(raw)
    }
  })

  test('a bare value reads as "is", so a plain link keeps working', () => {
    const parsed = parseCondition(spec.fields[0]!, 'RED')
    expect('condition' in parsed && parsed.condition).toEqual({ key: 'colour', operator: 'is', values: ['RED'] })
  })
})

describe('a chip says what it filters in words (criterion 3)', () => {
  test('a closed list reads its option label', () => {
    expect(saysCondition(spec.fields[0]!, { key: 'colour', operator: 'any', values: ['RED', 'BLUE'] })).toBe('colour is any of Red, Blue')
    expect(saysCondition(spec.fields[0]!, { key: 'colour', operator: 'empty', values: [] })).toBe('colour is empty')
  })

  test('a date reads in British order and a number reads as under or over', () => {
    expect(saysCondition(spec.fields[2]!, { key: 'seenOn', operator: 'before', values: ['2026-03-04'] })).toBe('seenOn before 4 Mar 2026')
    expect(saysCondition(spec.fields[3]!, { key: 'weight', operator: 'after', values: ['12'] })).toBe('weight over 12')
    expect(saysCondition(spec.fields[3]!, { key: 'weight', operator: 'between', values: ['1', '9'] })).toBe('weight between 1 and 9')
  })

  test('a reference reads the name it was given, and never a bare identifier when one is known', () => {
    expect(saysCondition(spec.fields[1]!, { key: 'owner', operator: 'is', values: ['u1'] }, [{ value: 'u1', label: 'Ivy' }])).toBe('owner is Ivy')
    expect(saysCondition(spec.fields[1]!, { key: 'owner', operator: 'is', values: ['u1'] })).toBe('owner is chosen')
  })

  test('a yes or no reads as the label, its negation, or the wording the field gives for no', () => {
    expect(saysCondition(spec.fields[4]!, { key: 'live', operator: 'is', values: ['true'] })).toBe('live')
    expect(saysCondition(spec.fields[4]!, { key: 'live', operator: 'is', values: ['false'] })).toBe('Not live')
    const worded = { ...spec.fields[4]!, negated: 'Retired' }
    expect(saysCondition(worded, { key: 'live', operator: 'is', values: ['false'] })).toBe('Retired')
  })
})

describe('the two migrated declarations (criteria 1 and 6)', () => {
  test('accounts filters on a role, which is not a column, and shows on a season, which is', () => {
    const role = fieldOf(accountsList, 'role')
    expect(role?.column).toBeUndefined()
    expect(role?.kind).toBe('list')
    expect(role?.cap).toBeGreaterThan(0)
    // One question, one field: "holds no role" is holdsRole, so role does not also offer empty.
    expect(operatorsOf(role!)).not.toContain('empty')
    const season = fieldOf(showsList, 'seasonId')
    expect(season?.column).toBe('season_id')
  })

  test('every declared key is unique and no field shares a key with the paging or search keys', () => {
    for (const declared of [accountsList, showsList]) {
      const keys = declared.fields.map(one => one.key)
      expect(new Set(keys).size).toBe(keys.length)
      for (const reserved of ['page', 'pageSize', 'search', 'sort', 'direction']) expect(keys).not.toContain(reserved)
    }
  })
})
