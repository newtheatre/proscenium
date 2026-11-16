// A sample count: three drafts while the gallery's sample is open, none when it is closed.
import { useSetting } from '#kit'
import type { Count } from '../../../../../../../layers/core/server/points/count'

export default {
  async value() {
    return (await useSetting('gallery.demo.open')) ? 3 : 0 // not-policy: sample data
  },
} satisfies Count
