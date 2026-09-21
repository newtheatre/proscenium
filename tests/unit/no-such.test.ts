import { describe, expect, test } from 'bun:test'
import { noSuch, saysNoSuch } from '#server/utils/no-such'

// K-128 criterion 2. Around sixty nouns refused with "No such X", which says what happened and
// never what to do; the sentence is written once here so every route says the same thing.

describe('a missing thing says what happened and then what to do', () => {
  test('the default second sentence sends the reader back to the list', () => {
    expect(saysNoSuch('performance')).toBe('That performance is no longer here. Go back to the list and open it again.')
  })

  test('the noun is the route\'s own word, dropped in unchanged', () => {
    expect(saysNoSuch('stocked item')).toStartWith('That stocked item is no longer here.')
    expect(saysNoSuch('comp request')).toStartWith('That comp request is no longer here.')
  })

  test('a route with a better next step passes it and it wins', () => {
    expect(saysNoSuch('booking', 'Check the reference and try again'))
      .toBe('That booking is no longer here. Check the reference and try again.')
    expect(saysNoSuch('session', 'Open the sessions list and choose it again'))
      .toBe('That session is no longer here. Open the sessions list and choose it again.')
  })
})

// The punctuation rule in docs/copy-style.md section 5: one sentence carries no stop, two or
// more carry all of them. One noun in, two sentences out, so both stops are there.
describe('the sentence is punctuated the way the house style says', () => {
  test('two sentences, both stopped, and no stop doubled by a caller\'s own', () => {
    for (const said of [saysNoSuch('venue'), saysNoSuch('booking', 'Check the reference and try again')]) {
      expect(said.split('. ')).toHaveLength(2)
      expect(said).toEndWith('.')
      expect(said).not.toContain('..')
    }
  })

  test('nothing says "No such" any more', () => {
    expect(saysNoSuch('account')).not.toContain('No such')
  })
})

describe('the helper hands back the refusal a route throws', () => {
  test('a 404 carrying the sentence', () => {
    const error = noSuch('show')
    expect(error.statusCode).toBe(404)
    expect(error.statusMessage).toBe('That show is no longer here. Go back to the list and open it again.')
  })

  test('the next step reaches the thrown refusal too', () => {
    expect(noSuch('booking', 'Check the reference and try again').statusMessage)
      .toBe('That booking is no longer here. Check the reference and try again.')
  })
})
