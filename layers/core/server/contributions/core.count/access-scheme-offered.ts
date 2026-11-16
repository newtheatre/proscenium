// One while the theatre runs the access scheme, else nought. My account's entry and section for the
// scheme name it with hideEmpty, so they are absent while the scheme is off (ID-38).
import type { Count } from '../../points/count'
import { schemeEnabled } from '../../identity/access-scheme'

export default { value: async () => (await schemeEnabled()) ? 1 : 0 } satisfies Count
