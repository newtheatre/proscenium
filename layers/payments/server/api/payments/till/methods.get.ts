// The ways to pay at the desk the till offers: each ready provider account's desk methods, with the
// card readers paired to an account that takes card on a reader.
import { defineRoute } from '#kit'
import { methodsFor } from '../../../providers'
import { listReaders } from '../../../readers'

export default defineRoute({
  ability: 'payments.attempt.attest',
  rateLimit: 'default',
}, async () => {
  const offers = await methodsFor('desk')
  const readers = new Map<string, { id: string, label: string }[]>()
  for (const m of offers) {
    if (m.method !== 'card_reader' || readers.has(m.providerAccountId)) continue
    readers.set(m.providerAccountId, (await listReaders(m.providerAccountId)).filter(r => r.active).map(r => ({ id: r.id, label: r.label })))
  }
  return { methods: offers.map(m => ({ ...m, readers: m.method === 'card_reader' ? readers.get(m.providerAccountId) ?? [] : undefined })) }
})
