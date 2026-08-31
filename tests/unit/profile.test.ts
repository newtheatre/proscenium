import { describe, expect, test } from 'bun:test'
import { AUDIENCES, PROFILE_FIELDS, profileForm } from '#shared/utils/profile'

// A-114. Criterion 1 is that every field states who can see it before somebody fills it in, so the
// audience is part of the field rather than a sentence on a screen that can be forgotten.

describe('every field says who can see it', () => {
  test('there are no fields without an audience', () => {
    for (const field of PROFILE_FIELDS) {
      expect(Object.keys(AUDIENCES)).toContain(field.audience)
    }
  })

  test('each audience is written out for a reader, not named in code', () => {
    for (const audience of Object.values(AUDIENCES)) expect(audience.length).toBeGreaterThan(15)
  })

  test('the fields are the ones the story names, and no others', () => {
    expect(PROFILE_FIELDS.map(field => field.name).sort())
      .toEqual(['emergencyName', 'emergencyPhone', 'emergencyRelation', 'name', 'phone', 'pronouns'])
  })

  // Criterion 3: these belong to module D as consents with their own audiences, not to a profile.
  test('dietary and access needs are not profile fields', () => {
    const names = PROFILE_FIELDS.map(field => field.name.toLowerCase()).join(' ')
    expect(names).not.toContain('diet')
    expect(names).not.toContain('access')
    expect(names).not.toContain('allerg')
  })
})

describe('pronouns are offered, never assumed (criterion 1)', () => {
  const field = PROFILE_FIELDS.find(one => one.name === 'pronouns')

  test('they are optional', () => {
    expect(field?.optional).toBe(true)
    expect(profileForm.safeParse({ name: 'Imogen Hart' }).success).toBe(true)
  })

  test('they are free text rather than a list to pick from', () => {
    expect(profileForm.safeParse({ name: 'Imogen Hart', pronouns: 'ze/hir' }).success).toBe(true)
    expect(profileForm.safeParse({ name: 'Imogen Hart', pronouns: 'any' }).success).toBe(true)
  })

  test('an empty answer is kept as no answer rather than an empty string', () => {
    expect(profileForm.parse({ name: 'Imogen Hart', pronouns: '   ' }).pronouns).toBeNull()
  })
})

describe('the emergency contact is held to its audience', () => {
  test('its three fields share one audience, because they are one fact', () => {
    const audiences = new Set(PROFILE_FIELDS
      .filter(field => field.name.startsWith('emergency'))
      .map(field => field.audience))
    expect(audiences.size).toBe(1)
  })

  // The gate the story asks for needs shifts and production roles, which do not exist yet, so it
  // denies everyone until they do rather than opening wider than the story allows.
  test('nobody but its owner can see it yet', () => {
    const contact = PROFILE_FIELDS.find(field => field.name === 'emergencyName')
    expect(contact?.audience).toBe('you')
  })
})

describe('a name is required, because everything else refers to it', () => {
  test('an empty one is refused', () => {
    expect(profileForm.safeParse({ name: '' }).success).toBe(false)
    expect(profileForm.safeParse({ name: '   ' }).success).toBe(false)
  })

  test('a phone number is optional and kept as given', () => {
    expect(profileForm.parse({ name: 'Imogen Hart', phone: '07700 900000' }).phone).toBe('07700 900000')
    expect(profileForm.parse({ name: 'Imogen Hart' }).phone).toBeNull()
  })

  // An emergency contact without a way to reach it is not a contact.
  test('an emergency name without a number is refused', () => {
    expect(profileForm.safeParse({ name: 'Imogen Hart', emergencyName: 'Her Mother' }).success).toBe(false)
    expect(profileForm.safeParse({ name: 'Imogen Hart', emergencyName: 'Her Mother', emergencyPhone: '07700 900000' }).success).toBe(true)
  })
})
