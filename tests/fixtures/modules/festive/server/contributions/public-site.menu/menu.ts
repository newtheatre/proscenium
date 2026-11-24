import { festive } from '../../state'

export default {
  entries: async () => [{ labelKey: 'festive.venues', to: '/venues', order: 2 }, { labelKey: 'festive.events', to: '/events', order: 1 }],
  footer: async () => [{ labelKey: 'festive.about', to: '/about-the-festival' }],
  appliesWhen: async () => festive.on,
}
