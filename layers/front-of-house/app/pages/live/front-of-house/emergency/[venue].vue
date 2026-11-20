<!-- A venue's emergency card (Front of house specification, part 5, "Live mode"; FH-26), in large
     type with the date it was last reviewed. Every card is kept on the device once opened, so the
     card still opens with no signal. Its Markdown is drawn, and every telephone number is a link. -->
<script setup lang="ts">
interface Card { venueId: string, venueName: string, body: string, reviewedOn: string, updatedAt: number }
const KEPT = 'proscenium:front-of-house:emergency-cards'

const { t } = useT()
const { day } = useDates()
const route = useRoute()
const venue = computed(() => String(route.params.venue))
const { data, status, error, refresh } = await useAPI<{ cards: Card[] }>('/api/front-of-house/emergency-cards', { key: 'front-of-house:emergency-cards', server: false })

// The device's copy: written whenever the server answers, read when it cannot.
const kept = ref<Card[]>([])
onMounted(() => {
  try {
    kept.value = JSON.parse(localStorage.getItem(KEPT) ?? '[]') as Card[]
  }
  catch {
    kept.value = []
  }
})
watch(data, (d) => {
  if (!d) return
  try {
    localStorage.setItem(KEPT, JSON.stringify(d.cards))
  }
  catch {
    // A full or blocked store only means the card is not kept for next time.
  }
}, { immediate: true })

const cards = computed(() => data.value?.cards ?? kept.value)
const card = computed(() => cards.value.find(c => c.venueId === venue.value) ?? null)
// Opened from a performance's board, the way back is that board; otherwise front of house tonight.
const back = computed(() => typeof route.query.performance === 'string' ? `/live/front-of-house/${encodeURIComponent(route.query.performance)}` : '/live/front-of-house')
const fromDevice = computed(() => !data.value && !!card.value)
</script>

<template>
  <PageLive
    :title="t('front-of-house.live.emergency-card')"
    :context="card?.venueName"
    :back="back"
  >
    <div class="mx-auto max-w-3xl space-y-4">
      <template v-if="card">
        <p class="text-sm text-muted">
          {{ t('front-of-house.live.reviewed-on', { date: day(card.reviewedOn) }) }}
          <span v-if="fromDevice">· {{ t('front-of-house.live.kept-copy') }}</span>
        </p>
        <MarkdownText
          :text="card.body"
          link-phones
          class="text-2xl leading-relaxed text-highlighted"
        />
      </template>
      <DataBoundary
        v-else
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <EmptyState
          icon="i-lucide-siren"
          :title="t('front-of-house.live.no-card.title')"
          :description="t('front-of-house.live.no-card.description')"
        />
      </DataBoundary>
    </div>
  </PageLive>
</template>
