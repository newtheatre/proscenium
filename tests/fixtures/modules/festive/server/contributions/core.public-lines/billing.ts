import { festive } from '../../state'

export default {
  read: async (productionId: string) => festive.ids.has(productionId)
    ? [{ text: '  By arrangement with Samuel French  ', placement: 'credits' as const, order: 2 }, { text: 'A festival premiere', placement: 'under-title' as const, order: 1 }]
    : [],
}
