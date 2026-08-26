import { describe, expect, test } from 'bun:test'
import { SENDERS, SENDER_ADDRESSES, SENDING_DOMAIN, senderForTopic } from '#shared/utils/senders'

const TOPICS = ['BOOKINGS', 'SHIFTS', 'TRAINING', 'ROOMS', 'ANNOUNCEMENTS'] as const

describe('sender identities (0020)', () => {
  test('every address is on the one onboarded sending domain', () => {
    for (const [key, sender] of Object.entries(SENDERS)) {
      expect(`${key}: ${sender.address.endsWith(`@${SENDING_DOMAIN}`)}`).toBe(`${key}: true`)
    }
  })

  test('no address is a no-reply', () => {
    for (const [key, sender] of Object.entries(SENDERS)) {
      const local = sender.address.split('@')[0]!.toLowerCase().replace(/[.\-_]/g, '')
      expect(`${key}: ${local.startsWith('noreply') || local.startsWith('donotreply')}`).toBe(`${key}: false`)
    }
  })

  test('every identity has a display name', () => {
    for (const [key, sender] of Object.entries(SENDERS)) {
      expect(`${key}: ${sender.name.trim().length > 0}`).toBe(`${key}: true`)
    }
  })

  test('the address list matches the registry exactly', () => {
    expect([...SENDER_ADDRESSES].sort()).toEqual(Object.values(SENDERS).map(s => s.address).sort())
  })

  test('addresses are unique', () => {
    expect(new Set(SENDER_ADDRESSES).size).toBe(SENDER_ADDRESSES.length)
  })

  // CI builds before it tests, so this always runs there. Locally it reports the skip rather
  // than passing quietly.
  test('the built worker binding allows exactly these addresses', async () => {
    const built = Bun.file('.output/server/wrangler.json')
    if (!await built.exists()) {
      console.warn('[senders] .output/server/wrangler.json absent: run `bun run build` to check the binding')
      return
    }
    const config = await built.json()
    const binding = config.send_email?.find((b: { name: string }) => b.name === 'EMAIL')
    expect(binding).toBeDefined()
    expect([...binding.allowed_sender_addresses].sort()).toEqual([...SENDER_ADDRESSES].sort())
  })

  test('every notification topic resolves to one identity', () => {
    for (const topic of TOPICS) {
      const sender = senderForTopic(topic)
      expect(`${topic}: ${SENDER_ADDRESSES.includes(sender.address)}`).toBe(`${topic}: true`)
    }
  })
})
