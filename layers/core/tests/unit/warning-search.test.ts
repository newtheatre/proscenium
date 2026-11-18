import { describe, expect, it } from 'vitest'
import { warningMatches } from '../../app/utils/warning-search'

const weapons = { label: 'Weapons', description: 'Knives, guns or other weapons carried or used.' }
const sexualViolence = { label: 'Sexual violence', description: 'Rape or sexual assault, shown or described.' }
const language = { label: 'Strong language', description: 'Swearing, including strong swear words.' }

describe('warningMatches (C-53)', () => {
  it('finds a warning by a word in its description, not only its name', () => {
    expect(warningMatches(weapons, 'Violence and harm', 'gun')).toBe(true)
    expect(warningMatches(weapons, 'Violence and harm', 'knife')).toBe(true)
  })
  it('finds a warning through an everyday word', () => {
    expect(warningMatches(language, 'Language and substances', 'profanity')).toBe(true)
    expect(warningMatches(sexualViolence, 'Sexual content and abuse', 'rape')).toBe(true)
  })
  it('finds a warning by its heading and ignores case and spaces', () => {
    expect(warningMatches(weapons, 'Violence and harm', '  HARM ')).toBe(true)
  })
  it('needs every word typed', () => {
    expect(warningMatches(weapons, 'Violence and harm', 'gun swearing')).toBe(false)
  })
  it('finds nothing for a word that is nowhere', () => {
    expect(warningMatches(weapons, 'Violence and harm', 'strobe')).toBe(false)
  })
  it('matches everything for an empty search', () => {
    expect(warningMatches(weapons, '', '')).toBe(true)
  })
})
