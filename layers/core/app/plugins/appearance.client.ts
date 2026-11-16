// The starting colour mode: what a first-time visitor sees is the site owner's choice
// (core.appearance.default). A person's own choice, made from the menu, is theirs and wins, unless
// the site owner has turned the choice off, when everyone sees the starting mode.
import { CHOSEN_KEY } from '../../shared/appearance'

export default defineNuxtPlugin((nuxtApp) => {
  // After the colour-mode module has read what the browser stored, or it would overwrite this.
  nuxtApp.hook('app:mounted', async () => {
    const colorMode = useColorMode()
    const { data } = await usePublicSettings()
    const start = data.value['core.appearance.default']?.value
    const mayChoose = data.value['core.appearance.let-people-choose']?.value !== false
    if (start !== 'system' && start !== 'light' && start !== 'dark') return
    // A person's own choice is marked when they make it (the account menu); Nuxt stores a mode on
    // the first visit too, so its stored value alone does not say who chose it.
    let chosen: string | null = null
    try { chosen = localStorage.getItem(CHOSEN_KEY) }
    catch { /* no storage: the starting mode applies */ }
    if (chosen && mayChoose) return
    colorMode.preference = start
  })
})
