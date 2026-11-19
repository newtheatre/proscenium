// Whether maintenance mode is on, and the addresses modules keep open meanwhile. Only ever answered
// while it is on: with the module off, the kit answers "not found". The browser asks so that a
// visitor already on the site, moving between pages without reloading, is shown the holding page
// rather than pages whose loads are refused.
import { defineRoute, usePoint } from '#kit'

export default defineRoute({
  public: true,
  rateLimit: 'default',
}, async () => ({
  on: true,
  open: (await usePoint<{ prefix: string }>('maintenance.open-address')).map(c => c.value.prefix),
}))
