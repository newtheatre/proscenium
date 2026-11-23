<!-- The booking action for one performance (C-39), from core.booking-action: Box office's answer when
     it is on, the theatre's external link when it is not, and nothing with neither. The answer is
     facts, and the words for each of the five states are here, so they follow the visitor's
     language. `when` names the performance for a screen reader, so a page of "Book" buttons can be
     told apart. The theatre's own outside link says whose site it opens, with `company` for a
     visiting show, and that it opens in a new tab. When the answer names a drawer, the button opens
     it over the page with `title` (the show's name) at its head; with scripts off the link is followed. -->
<script setup lang="ts">
interface Booking {
  state: 'available' | 'limited' | 'sold-out' | 'not-yet' | 'closed'
  link?: string
  seatsLeft?: number
  sellingFast?: true
  opensAt?: number
  waitingList?: string
  label?: string
  external?: true
  drawer?: string
}
const props = defineProps<{ booking: Booking | null, when: string, size?: 'sm' | 'md' | 'lg', company?: string | null, title?: string }>()
const { t } = useT()
const { dateTime } = useDates()

const note = computed(() => {
  const b = props.booking
  if (!b) return null
  if (b.state === 'limited') return b.seatsLeft ? t('public-site.booking.seats-left', { count: b.seatsLeft }) : t('public-site.booking.last-few')
  if (b.state === 'available' && b.sellingFast) return t('public-site.booking.selling-fast')
  if (b.state === 'sold-out') return t('public-site.booking.sold-out')
  if (b.state === 'not-yet') return b.opensAt ? t('public-site.booking.opens', { when: dateTime(b.opensAt) }) : t('public-site.booking.not-yet')
  if (b.state === 'closed') return t('public-site.booking.closed')
  return null
})
const label = computed(() => {
  const b = props.booking
  if (b?.label) return b.label
  if (b?.external) return props.company ? t('public-site.booking.book-with', { company: props.company }) : t('public-site.booking.book-elsewhere')
  return t('public-site.booking.book')
})
const bookable = computed(() => !!props.booking?.link && (props.booking.state === 'available' || props.booking.state === 'limited'))
const drawing = computed(() => !!props.booking?.drawer && !!props.title && !props.booking.external)
const open = ref(false)
function book(event: MouseEvent) {
  if (!drawing.value || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  open.value = true
}
</script>

<template>
  <div
    v-if="booking"
    class="flex flex-wrap items-center justify-end gap-x-3 gap-y-1"
  >
    <span
      v-if="note"
      class="text-sm text-muted"
    >{{ note }}</span>
    <UButton
      v-if="bookable"
      :to="booking.link"
      :target="booking.external ? '_blank' : undefined"
      :trailing-icon="booking.external ? 'i-lucide-external-link' : undefined"
      :size="size ?? 'md'"
      @click="book"
    >
      {{ label }}<span class="sr-only">{{ t('public-site.booking.for', { when }) }}<template v-if="booking.external">{{ t('public-site.booking.new-tab') }}</template></span>
    </UButton>
    <ULink
      v-else-if="booking.state === 'sold-out' && booking.waitingList"
      :to="booking.waitingList"
      class="text-sm font-medium text-primary hover:underline"
    >
      {{ t('public-site.booking.waiting-list') }}<span class="sr-only">{{ t('public-site.booking.for', { when }) }}</span>
    </ULink>
    <PublicSiteBookingDrawer
      v-if="drawing && bookable"
      v-model:open="open"
      :name="booking.drawer!"
      :link="booking.link!"
      :title="title!"
      :when="when"
    />
  </div>
</template>
