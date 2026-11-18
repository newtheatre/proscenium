// Whether an active provider account takes cards through this company.
import { cardCompanies } from '../../policies/card-companies'

export default {
  async value() {
    const on = (await cardCompanies()).some(c => c.id === 'stripe')
    return { value: on, text: on ? 'yes' : 'no' }
  },
}
