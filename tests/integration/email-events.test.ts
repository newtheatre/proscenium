// The EMAIL_EVENTS queue: each message reaches core.email-events in its own unit of work and is
// acknowledged or retried on its own; an outcome that arrives before its send is recorded is tried
// again shortly, then set aside; and nothing from the message body reaches the log.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { handleQueue } from '#kit/worker'
import { EMAIL_EVENT_RETRY, setEmailEventsConsumer, type EmailEvent } from '#kit/email-events'
import { env, performance, rows } from './helpers'

function message(body: unknown, attempts = 1) {
  return { id: `msg-${Math.random()}`, timestamp: new Date(), attempts, body, ack: vi.fn(), retry: vi.fn() }
}
const batch = (messages: ReturnType<typeof message>[], queue = 'proscenium-email-events') => ({ queue, messages, ackAll: vi.fn(), retryAll: vi.fn() }) as unknown as MessageBatch<{ jobId?: string }>

const bounced = (messageId: string): EmailEvent => ({
  type: 'cf.email.sending.message.bounced',
  payload: { messageId, recipient: 'someone@example.org', subject: 'Your tickets for Hamlet', bounce: { type: 'hard' } },
})

afterEach(() => {
  setEmailEventsConsumer(undefined)
  vi.restoreAllMocks()
})

describe('the EMAIL_EVENTS queue', () => {
  it('hands each outcome to core.email-events and commits its unit', async () => {
    const id = await performance(5)
    const seen: string[] = []
    setEmailEventsConsumer(async (event, unit) => {
      seen.push(event.payload.messageId)
      unit.add(sql`UPDATE seats_performances SET sold = sold + 1 WHERE id = ${id}`)
      return 'done'
    })
    const m = message(bounced('<abc@mail.example>'))
    await handleQueue(batch([m]), env)
    expect(seen).toEqual(['<abc@mail.example>'])
    expect(m.ack).toHaveBeenCalledOnce()
    expect(await rows('SELECT sold FROM seats_performances WHERE id = ?', id)).toEqual([{ sold: 1 }])
  })

  it('tries an outcome for a send not yet recorded again shortly, without committing', async () => {
    const id = await performance(5)
    setEmailEventsConsumer(async (_event, unit) => {
      unit.add(sql`UPDATE seats_performances SET sold = sold + 1 WHERE id = ${id}`)
      return 'not-yet'
    })
    const m = message(bounced('<early@mail.example>'))
    await handleQueue(batch([m]), env)
    expect(m.ack).not.toHaveBeenCalled()
    expect(m.retry).toHaveBeenCalledWith({ delaySeconds: EMAIL_EVENT_RETRY.notYet })
    expect(await rows('SELECT sold FROM seats_performances WHERE id = ?', id)).toEqual([{ sold: 0 }])
  })

  it('acknowledges and retries each message on its own, and says when one is set aside', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setEmailEventsConsumer(async event => event.payload.messageId === '<ok@m>' ? 'done' : 'not-yet')
    const ok = message(bounced('<ok@m>'))
    const late = message(bounced('<late@m>'), EMAIL_EVENT_RETRY.setAsideAfter)
    await handleQueue(batch([ok, late]), env)
    expect(ok.ack).toHaveBeenCalledOnce()
    expect(late.retry).toHaveBeenCalledOnce()
    expect(warn.mock.calls.map(c => JSON.parse(c[0]).message)).toContain('core.email-events.set-aside')
  })

  it('never logs the message body, only its id and type', async () => {
    const lines: string[] = []
    for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation((line: string) => void lines.push(line))
    setEmailEventsConsumer(async () => {
      throw new Error('Delivery to someone@example.org failed')
    })
    const m = message(bounced('<boom@m>'))
    await handleQueue(batch([m]), env)
    expect(m.retry).toHaveBeenCalledWith({ delaySeconds: EMAIL_EVENT_RETRY.failed })
    const logged = lines.join('\n')
    expect(logged).toContain('cf.email.sending.message.bounced')
    expect(logged).not.toMatch(/someone@example\.org|Hamlet|<boom@m>/)
  })

  it('acknowledges what it cannot read, and what nothing consumes yet', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unreadable = message({ hello: 'world' })
    const unconsumed = message(bounced('<x@m>'))
    await handleQueue(batch([unreadable, unconsumed]), env)
    expect(unreadable.ack).toHaveBeenCalledOnce()
    expect(unconsumed.ack).toHaveBeenCalledOnce()
  })

  it('leaves the job lanes to the job runner', async () => {
    const m = message({ jobId: 'job_missing' })
    await handleQueue(batch([m], 'proscenium-prompt'), env)
    expect(m.ack).toHaveBeenCalledOnce()
  })
})
