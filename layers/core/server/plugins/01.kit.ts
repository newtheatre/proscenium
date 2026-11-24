// Installs the generated registry and migrations when the server starts. Under `nuxt dev`, which has
// no queue consumer or cron trigger, jobs run in-process as soon as they are sent and the scheduler
// ticks once a minute, so a module behaves locally as it will on Cloudflare.
import type { H3Event } from 'h3'
import { definePlugin as defineNitroPlugin } from 'nitro'
import { registry, migrations, release } from '#registry'
import { installRegistry } from '#kit/registry'
import { installMigrations } from '#kit/migrations'
import { setDispatcher } from '#kit/dispatch'
import { runInContext, useContext, type KitEnv } from '#kit/context'
import { runJob, tick } from '#kit/jobs'
import { log } from '#kit/log'
import { rememberEnv } from '#kit/route'

export default defineNitroPlugin((nitroApp) => {
  installRegistry(registry)
  installMigrations(migrations, release)
  nitroApp.hooks.hook('request', (raw) => {
    const event = raw as unknown as H3Event
    // Nitro v3 keeps the platform on the request, not on event.context.
    const cf = (event as unknown as { req?: { runtime?: { cloudflare?: unknown } } }).req?.runtime?.cloudflare
    if (cf && !event.context.cloudflare) (event.context as Record<string, unknown>).cloudflare = cf
    rememberEnv(event.context.cloudflare?.env as KitEnv | undefined)
  })
  if (!import.meta.dev) return

  let env: KitEnv | undefined
  nitroApp.hooks.hook('request', (raw) => {
    const event = raw as unknown as H3Event
    env ??= event.context.cloudflare?.env as KitEnv | undefined
  })
  setDispatcher(async (messages) => {
    const current = useContext().env
    for (const message of messages) {
      setTimeout(() => {
        runInContext({ env: current, actor: { kind: 'job' }, cache: {} }, () => runJob(message.jobId))
          .catch(error => log.error('core.dev.job-failed', { jobId: message.jobId, error: String(error) }))
      }, (message.delaySeconds ?? 0) * 1000) // not-policy: seconds to milliseconds
    }
  })
  setInterval(() => {
    if (env) tick(env, Date.now()).catch(error => log.error('core.dev.tick-failed', { error: String(error) }))
  }, 60_000) // not-policy: the cron trigger's interval
})
