// How many health checks are not ok, for someone who may see the site's health: the Admin
// overview's health card names it, so the card shows only while something needs attention.
import { can } from '#kit'
import type { Count } from '../../points/count'
import { healthProblems } from '../../interface/health'

export default {
  async value(actor) {
    if (!(await can(actor, 'core.health.view')).allowed) return 0
    return (await healthProblems()).length
  },
} satisfies Count
