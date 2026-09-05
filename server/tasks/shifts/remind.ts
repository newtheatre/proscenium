// The day before, once per confirmed shift, carrying an ICS to add it to the rest of the
// evening's plans (E-109 criterion 1).
export default defineTask({
  meta: {
    name: 'shifts:remind',
    description: 'Remind tomorrow\'s confirmed shift holders, with a calendar attachment',
  },
  async run() {
    return { result: await remindShiftsTomorrow(undefined, new Date()) }
  },
})
