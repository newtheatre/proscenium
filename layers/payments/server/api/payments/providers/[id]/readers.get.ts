// The card readers paired with a provider account.
import { getRouterParam } from 'h3'
import { defineRoute } from '#kit'
import { listReaders } from '../../../../readers'

export default defineRoute({ ability: 'payments.provider.manage', rateLimit: 'default' }, async event => ({
  readers: (await listReaders(getRouterParam(event, 'id') ?? '')).map(r => ({ id: r.id, label: r.label, active: !!r.active, createdAt: r.created_at })),
}))
