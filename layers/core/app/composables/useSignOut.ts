// Signing out is a POST from a button, never a link: a link can be followed by a prefetcher or a
// cross-site page. The address is Identity's (it reserves /sign-in and its sub-paths).
export const SIGN_OUT_PATH = '/sign-in/out'

export function useSignOut() {
  async function signOut() {
    await $fetch(SIGN_OUT_PATH, { method: 'POST' }).catch(() => undefined)
    // A full reload, so nothing of the signed-in person's pages stays in memory.
    reloadNuxtApp({ path: '/', persistState: false })
  }
  return { signOut }
}
