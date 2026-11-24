// A practice scenario, for the permission screens and the fact that opens it: its catalogue key as
// the title, which screens translate, and its practice address.
import { usePoint } from '#kit'
import type { RecordResolver } from '../../points/record-resolver'
import type { PracticeScenario } from '../../practice/scenarios'

export default {
  async resolve(id) {
    const scenario = (await usePoint<PracticeScenario>('core.practice-scenario')).find(c => c.id === id)?.value
    return scenario ? { title: scenario.label, to: `/practice/${id}` } : null
  },
  async choices(limit) {
    return (await usePoint<PracticeScenario>('core.practice-scenario')).slice(0, limit).map(c => ({ id: c.id, title: c.value.label }))
  },
} satisfies RecordResolver
