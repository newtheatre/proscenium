// Shows a sample production the way every record is shown: a title and where to open it.
import type { RecordResolver } from '../../../../../../../layers/core/server/points/record-resolver'
import { productions } from '../../productions'

export default {
  async resolve(id: string) {
    const found = productions.find(p => p.id === id)
    return found ? { title: found.name, to: `/console/gallery/list?q=${encodeURIComponent(found.name)}` } : null
  },
} satisfies RecordResolver
