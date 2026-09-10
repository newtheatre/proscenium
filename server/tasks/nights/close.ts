// Auto-close within 24 hours (E-125): every performance nobody signed off, closed as SYSTEM.
export default defineTask({
  meta: {
    name: 'nights:close',
    description: 'Auto-close unsigned night reports inside 24 hours (E-125)',
  },
  async run() {
    const due = await performancesDueAutoClose(new Date())
    let closed = 0
    for (const target of due) {
      if (await autoCloseNight(undefined, target)) closed++
    }
    return { result: { due: due.length, closed } }
  },
})
