// A heading or label inside a sentence, as the generated settings page's Save button names its section.
import { describe, expect, it } from 'vitest'
import { inSentence } from '../../app/utils/sentence'

describe('inSentence', () => {
  it('lower-cases the first letter, and drops a leading "The" where asked', () => {
    expect(inSentence('The theatre', { article: false })).toBe('theatre')
    expect(inSentence('The organisation', { article: false })).toBe('organisation')
    expect(inSentence('Look and feel')).toBe('look and feel')
    expect(inSentence("The site's address")).toBe("the site's address")
  })

  it('keeps an abbreviation or a name with a capital inside it as written', () => {
    expect(inSentence('VAT returns')).toBe('VAT returns')
    expect(inSentence('PayPal')).toBe('PayPal')
    expect(inSentence('The', { article: false })).toBe('the')
  })
})
