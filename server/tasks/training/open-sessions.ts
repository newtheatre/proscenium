// A session set to open for sign-up later opens on the tick after its instant; nothing else moves
// one out of PLANNED, and the asks it answers resolve then rather than never (G-104, G-112).
export default defineTask({
  meta: {
    name: 'training:open-sessions',
    description: 'Open planned sessions whose sign-up instant has passed, and resolve the requests they answer',
  },
  async run() {
    return { result: await openDueSessions(undefined, new Date()) }
  },
})
