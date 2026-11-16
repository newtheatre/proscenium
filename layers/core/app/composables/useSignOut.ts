// Signing out is a POST from a button, never a link: a link can be followed by a prefetcher or a
// cross-site page. Identity's endpoint takes a JSON body.
export const SIGN_OUT_PATH = '/api/core/sign-out'

export function useSignOut() {
  const { $api } = useNuxtApp()
  async function signOut() {
    await $api(SIGN_OUT_PATH, { method: 'POST', body: {} }).catch(() => undefined)
    // What this device remembered about the person's lists goes with them.
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('core:list-columns:')) localStorage.removeItem(k) }
    catch { /* storage refused: nothing to clear */ }
    // A full reload, so nothing of the signed-in person's pages stays in memory.
    reloadNuxtApp({ path: '/', persistState: false })
  }
  return { signOut }
}
