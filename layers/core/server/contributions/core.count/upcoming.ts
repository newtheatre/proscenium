// How many things the person has coming, up to the card's length. My account's Upcoming card names
// it with hideEmpty, so the card shows only to someone with something coming.
import type { Count } from '../../points/count'
import { upcomingFor } from '../../interface/upcoming'

export default {
  async value(actor) {
    return (await upcomingFor(actor)).length
  },
} satisfies Count
