// Requests nobody has answered: the approvers are told once, and one that has waited too long
// lapses rather than sitting open forever (C-108 criterion 3).
export default defineTask({
  meta: {
    name: 'rooms:sweep',
    description: 'Escalate requests that are waiting, and lapse the ones for our own rooms that waited too long',
  },
  async run() {
    const at = new Date()
    return {
      result: {
        ...await sweepRequests(undefined, at),
        externalEscalated: await sweepExternalRequests(undefined, at),
      },
    }
  },
})
