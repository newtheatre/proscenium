// The seven-day unstaffed digest to whoever administers the rota (E-108, Prompt Book P6).
export default defineTask({
  meta: {
    name: 'shifts:escalate',
    description: 'Chase any performance inside seven days with an open shift or an unconfirmed duty manager',
  },
  async run() {
    return { result: await escalateUnstaffedRota(undefined) }
  },
})
