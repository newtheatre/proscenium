// The card companies connected, as words for a policy: "Stripe", "Stripe and SumUp".
import { cardCompanies } from '../../policies/card-companies'

export default {
  async value() {
    const names = (await cardCompanies()).map(c => c.name)
    const text = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? ''
    return { value: names.join(','), text }
  },
}
