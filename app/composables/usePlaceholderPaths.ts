// Which editorial pages are still awaiting the committee's copy (D-103 criterion 6). The header
// and the footer share the key, so a view that renders both reads the collection once.
export function usePlaceholderPaths(): Ref<string[]> {
  // Not awaited: both callers sit in the shell, where an async setup would suspend the whole page.
  // Nuxt still resolves it during the server render and the payload carries it over.
  const { data } = useAsyncData('content:placeholders', async () => {
    const pages = await queryCollection('content').where('placeholder', '=', true).select('path').all()
    return pages.map(page => page.path)
  }, { default: (): string[] => [] })

  return data
}
