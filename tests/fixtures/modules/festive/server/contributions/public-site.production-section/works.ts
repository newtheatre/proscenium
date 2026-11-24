import { festive } from '../../state'

export default {
  component: 'FestiveWorks',
  order: 10, // not-policy: a fixture's place
  appliesTo: async (id: string) => festive.ids.has(id),
}
