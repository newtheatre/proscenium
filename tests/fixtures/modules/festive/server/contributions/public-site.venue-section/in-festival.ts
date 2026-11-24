import { festive } from '../../state'

export default {
  component: 'FestiveInFestival',
  appliesTo: async (id: string) => {
    if (festive.failing) throw new Error('The fixture fails on purpose.')
    return festive.ids.has(id)
  },
}
