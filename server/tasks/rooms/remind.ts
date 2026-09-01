// The day before, once per member, carrying everything they hold tomorrow (C-113 criterion 3).
export default defineTask({
  meta: {
    name: 'rooms:remind',
    description: 'Remind members of the rooms they have booked tomorrow',
  },
  async run() {
    return { result: await remindTomorrow(undefined, new Date()) }
  },
})
