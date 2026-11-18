// A payment's title and address: the records it paid for, such as an order's reference.
import { intentTitle } from '../../owners'

export default {
  async resolve(id: string) {
    return intentTitle(id, 'Payment for')
  },
}
