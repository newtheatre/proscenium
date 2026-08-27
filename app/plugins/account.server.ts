// Read once while rendering, so the first paint already knows who is signed in. A component
// awaiting this instead would hold Suspense open and ship a page that never becomes interactive.
export default defineNuxtPlugin(async () => {
  await useAccount().refresh()
})
