// Signing out is a POST from a button, never a link: a link can be followed by a prefetcher or a
// cross-site page. Identity's endpoint takes a JSON body.
export const SIGN_OUT_PATH = '/api/core/sign-out'

export function useSignOut() {
  async function signOut() {
    await $fetch(SIGN_OUT_PATH, { method: 'POST', body: {} }).catch(() => undefined)
    // A full reload, so nothing of the signed-in person's pages stays in memory.
    reloadNuxtApp({ path: '/', persistState: false })
  }
  return { signOut }
}
