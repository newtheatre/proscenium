// A count that never answers, standing in for one whose store is stuck, so a screen is seen not to wait on it.
import type { Count } from '../../../../../../../layers/core/server/points/count'

export default { value: () => new Promise<number>(() => {}) } satisfies Count
