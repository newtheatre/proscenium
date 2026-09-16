import { describe, expect, test } from 'bun:test'
import { filterQuerySchema, fieldOf, operatorsOf } from '#shared/utils/list-filters'
import { rolesList } from '#shared/utils/roles-list'
import { ROLES, saysRole } from '#shared/utils/roles'

// The role register's declaration (A-131 criteria 1 and 2), held to the same rules every other
// console list answers to (K-129, 0006).

describe('the register declares the roles there are', () => {
  test('the role field offers every role and nothing else', () => {
    const field = fieldOf(rolesList, 'role')!
    expect(field.options?.map(option => option.value)).toEqual([...ROLES])
    expect(field.options?.map(option => option.label)).toEqual(ROLES.map(role => saysRole(role)))
  })

  test('the role list is capped at the number of roles there are (0006)', () => {
    expect(fieldOf(rolesList, 'role')!.cap).toBe(ROLES.length)
  })

  test('every field offers only operators its kind allows', () => {
    for (const field of rolesList.fields) expect(() => operatorsOf(field)).not.toThrow()
  })
})

describe('what the register can be asked', () => {
  const schema = filterQuerySchema(rolesList)
  const parse = (raw: Record<string, string>) => schema.safeParse(raw)

  test('a role, a lapsed grant and a permanent one are all questions it takes', () => {
    expect(parse({ role: 'is:BAR_MANAGER' }).success).toBe(true)
    expect(parse({ lapsed: 'true' }).success).toBe(true)
    expect(parse({ permanent: 'true' }).success).toBe(true)
  })

  test('a role that does not exist is refused rather than quietly dropped', () => {
    expect(parse({ role: 'is:SUPREME_LEADER' }).success).toBe(false)
  })

  test('an undeclared sort is refused, and the default sorts by the holder', () => {
    expect(parse({ sort: 'note' }).success).toBe(false)
    expect(rolesList.sort.default).toBe('name')
    expect(rolesList.sort.fields.map(field => field.key)).toContain('expiresAt')
  })

  test('the search box has a placeholder, because a register is searched by who is in it', () => {
    expect(rolesList.search?.placeholder).toBeTruthy()
  })
})
