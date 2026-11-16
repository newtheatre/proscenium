// The theatre's name and logo. Core's getBrand() supplies the real values once it exists; until then
// the name comes from the theatre's own navigation file, so a fork can already set it.
export async function useBrand() {
  const { data } = await useAsyncData('core:brand', () => queryCollection('navigation').first())
  return computed(() => ({ name: data.value?.name ?? 'Your theatre', logo: undefined as string | undefined }))
}

/** The public header and footer links, from site/content/navigation.yml. */
export async function useSiteNavigation() {
  const { data } = await useAsyncData('core:site-navigation', () => queryCollection('navigation').first())
  return computed(() => ({
    header: data.value?.header ?? [],
    footer: data.value?.footer ?? [],
    contact: data.value?.contact,
    credit: data.value?.credit,
  }))
}
