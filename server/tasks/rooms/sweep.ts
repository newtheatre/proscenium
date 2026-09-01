// Requests nobody has answered: the approvers are told once, and one that has waited too long
// lapses rather than sitting open forever (C-108 criterion 3).
export default defineTask({
  meta: {
    name: 'rooms:sweep',
    description: 'Escalate room requests that are waiting, and lapse the ones that waited too long',
  },
  async run() {
    return { result: await sweepRequests(undefined, new Date()) }
  },
})
