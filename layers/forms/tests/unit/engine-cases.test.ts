// The shared case set in Node (the browser's JavaScript engine family is covered by the browser
// run; the Worker runtime by tests/integration/engine-cases.test.ts). FB-106.
import { describe, expect, it } from 'vitest'
import { CASES, CASE_TODAY, differences, evaluate, parseDefinition, checkDefinition } from '../../shared/engine'

describe('the forms engine: the shared case set', () => {
  for (const c of CASES) {
    it(c.name, () => {
      expect(differences(c, evaluate(c.definition, c.answers, { today: CASE_TODAY, ...c.context }))).toEqual([])
    })
  }
  it('every definition in the case set matches the format and has no problems', () => {
    for (const definition of new Set(CASES.map(c => c.definition))) {
      expect(parseDefinition(definition)).toMatchObject({ ok: true })
      expect(checkDefinition(definition)).toEqual([])
    }
  })
})
