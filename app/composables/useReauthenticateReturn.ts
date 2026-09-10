// A Google reassertion is a full round trip, so success lands back here as a query flag rather
// than as a promise the page was still waiting on (A-128 criterion 4).
export function useReauthenticateReturn(): void {
  const route = useRoute()
  const router = useRouter()
  const toast = useToast()

  onMounted(() => {
    if (route.query.reauthenticated !== '1') return
    toast.add({ title: 'Confirmed. Try that again.', icon: 'i-lucide-shield-check', color: 'success' })
    const query = { ...route.query }
    delete query.reauthenticated
    void router.replace({ query })
  })
}
