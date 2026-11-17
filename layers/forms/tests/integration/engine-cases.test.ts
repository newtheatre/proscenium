// "Browser and server agree" (test plan): the same shared cases, run in the Worker runtime.
import { describe, expect, it } from 'vitest'
import { CASES, CASE_TODAY, differences, evaluate } from '../../shared/engine'

describe('the forms engine in the Worker runtime', () => {
  for (const c of CASES) {
    it(c.name, () => {
      expect(differences(c, evaluate(c.definition, c.answers, { today: CASE_TODAY, ...c.context }))).toEqual([])
    })
  }
})
