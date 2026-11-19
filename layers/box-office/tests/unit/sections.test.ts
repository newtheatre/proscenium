// A ticket is named by its type alone unless that type is sold in more than one section.
import { describe, expect, it } from 'vitest'
import { typesInSeveralSections } from '../../shared/sections'

describe('typesInSeveralSections', () => {
  it('names the section only for a type sold in more than one', () => {
    const pairs = [
      { bandId: 'general', ticketTypeId: 'adult' },
      { bandId: 'general', ticketTypeId: 'student' },
      { bandId: 'wheelchair', ticketTypeId: 'wheelchair-space' },
      { bandId: 'balcony', ticketTypeId: 'student' },
    ]
    expect([...typesInSeveralSections(pairs)]).toEqual(['student'])
  })

  it('names nothing where each type has one section', () => {
    expect(typesInSeveralSections([{ bandId: 'general', ticketTypeId: 'adult' }, { bandId: 'wheelchair', ticketTypeId: 'wheelchair-space' }]).size).toBe(0)
  })
})
