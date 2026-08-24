/**
 * Practice is scratch: a finished run and everything it did are deleted, not
 * archived. Nothing aggregates them (ADR-0032).
 */
export default defineTask({
  meta: {
    name: 'training:purge',
    description: 'Delete finished and expired training runs, and their events',
  },
  async run() {
    // The run row outlives the lesson by a day so an operator can see one ran
    // and why it ended. Its events go the moment the run does.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const purged = await purgeRuns(cutoff)

    console.log(`[training:purge] deleted ${purged} finished training run(s)`)
    return { result: `purged ${purged}` }
  },
})
