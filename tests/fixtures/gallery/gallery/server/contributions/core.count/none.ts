// A count that is always zero, so a card or tab that names it is absent.
import type { Count } from '../../../../../../../layers/core/server/points/count'

export default { async value() { return 0 } } satisfies Count // not-policy: sample data
