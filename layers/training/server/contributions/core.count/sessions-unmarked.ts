// K3's menu count: sessions over whose attendance is still open.
import type { Actor } from '#kit'
import { unmarkedSessions } from '../../console-sessions'

export default {
  value: (actor: Actor) => unmarkedSessions(actor),
}
