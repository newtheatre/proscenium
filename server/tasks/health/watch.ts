// Runs tight enough to catch a Workers Builds deploy the migrate workflow never touches, on the
// same check /api/health answers (J-106 criteria 3 and 5).
export default defineTask({
  meta: {
    name: 'health:watch',
    description: 'Open, notify on and close a sustained /api/health incident',
  },
  async run() {
    return { result: { outcome: await watchHealth(undefined) } }
  },
})
