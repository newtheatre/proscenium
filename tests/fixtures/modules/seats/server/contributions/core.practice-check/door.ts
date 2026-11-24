// A fixture scenario's checks: a task that ticks once a seat is sold to tonight's show.
import { definePracticeChecks, first } from '#kit'

export default definePracticeChecks({
  async sell({ results }) {
    return ((await first<{ sold: number }>('SELECT sold FROM seats_performances WHERE id = ?', results.show))?.sold ?? 0) > 3
  },
})
