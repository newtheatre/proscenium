// What the Worker does besides serving pages: run the job queues and the
// cron tick, and keep a missing build file from being cached.
import { definePlugin } from 'nitro'
import { useNitroApp } from 'nitro/app'
import { handleQueue, handleScheduled } from '#kit/worker'
import { setEmailEventsConsumer, setEmailEventsSetAside } from '#kit/email-events'
import { setContentUpkeep } from '#kit/content-upkeep'
import { useContext } from '#kit'
import type { KitEnv } from '#kit/context'
import { emailEventsConsumer, emailEventsSetAside } from '../email-events'
import { mendContentStore } from '../content-store'

export default definePlugin((nitroApp) => {
  setEmailEventsConsumer(emailEventsConsumer)
  setEmailEventsSetAside(emailEventsSetAside)
  // Nuxt Content's own route loads a collection on first ask, so the tick asks it through Nitro.
  setContentUpkeep(async (at) => {
    const { env } = useContext()
    const query = async (collection: string, sql: string) => {
      const response = await useNitroApp().fetch(new Request(`http://localhost/__nuxt_content/${collection}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql }) }))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    }
    await mendContentStore(env.DB, env.CACHE, at, query)
  })

  // The job lanes and EMAIL_EVENTS; handleQueue tells them apart by the batch's queue name.
  nitroApp.hooks.hook('cloudflare:queue', ({ batch, env }) => handleQueue(batch as MessageBatch<{ jobId?: string }>, env as KitEnv))
  nitroApp.hooks.hook('cloudflare:scheduled', ({ controller, env, context }) => handleScheduled(controller as ScheduledController, env as KitEnv, context as unknown as ExecutionContext))

  // A build file (/_nuxt/...) only reaches the Worker when the static assets have no such file: for a
  // few seconds during a deploy, or for an old page asking for a file the new build no longer has.
  // Nitro answers with its route rule's year-long immutable cache header, and the browser would keep
  // that failure: the page never starts. A missing build file is never cached.
  nitroApp.hooks.hook('response', (response, event) => {
    if (response.status === 404 && event.req.url.includes('/_nuxt/')) response.headers.set('cache-control', 'no-store') // not-policy: HTTP's "not found"
  })
})
