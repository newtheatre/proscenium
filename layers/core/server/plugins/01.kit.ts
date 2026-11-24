// Installs the generated registry and migrations when the server starts. Under `nuxt dev`, which has
// no queue consumer or cron trigger, jobs run in-process as soon as they are sent and the scheduler
// ticks once a minute, so a module behaves locally as it will on Cloudflare.
import { definePlugin } from 'nitro'
import { registry, migrations, release } from '#registry'
import { installRegistry } from '#kit/registry'
import { installMigrations } from '#kit/migrations'
import { setDispatcher } from '#kit/dispatch'
import { runInContext, useContext, type KitEnv } from '#kit/context'
import { bindings } from '#kit/bindings'
import { runJob, tick } from '#kit/jobs'
import { log } from '#kit/log'

export default definePlugin((nitroApp) => {
  installRegistry(registry)
  installMigrations(migrations, release)
  if (!import.meta.dev) return

  let env: KitEnv | undefined
  nitroApp.hooks.hook('request', (event) => { env ??= bindings(event) })
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
