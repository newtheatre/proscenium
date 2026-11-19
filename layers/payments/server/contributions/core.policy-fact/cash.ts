// Whether the theatre takes cash at the desk: it has a cash account in use.
import { takesCash } from '../../providers'

export default {
  async value() {
    const on = await takesCash()
    return { value: on, text: on ? 'yes' : 'no' }
  },
}
