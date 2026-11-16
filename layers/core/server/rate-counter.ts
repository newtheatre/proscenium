// The shared count behind the rate-limit classes that guard against guessing and flooding (F-36).
// One object for each class and caller (#kit/ratelimit names it), so every copy of the Worker
// counts against the same window. A window is fixed: it starts with the first request and lasts the
// class's period. When it ends an alarm erases the object's storage, so idle callers cost nothing.
import { DurableObject } from 'cloudflare:workers'

interface Rate { count: number, per: number }
interface Window { count: number, resets: number }

export class RateLimitCounter extends DurableObject {
  /** Counts one request at `at` (UTC milliseconds) against `limit`. */
  async take(limit: Rate, at: number): Promise<{ allowed: boolean, resets: number }> {
    let window = await this.ctx.storage.get<Window>('window')
    if (!window || window.resets <= at) {
      window = { count: 0, resets: at + limit.per * 1000 } // not-policy: seconds to milliseconds
      // On the object's own clock: the caller's may be a test's.
      await this.ctx.storage.setAlarm(Date.now() + limit.per * 1000) // not-policy: seconds to milliseconds
    }
    window.count++
    await this.ctx.storage.put('window', window)
    return { allowed: window.count <= limit.count, resets: window.resets }
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }
}
