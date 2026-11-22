<!-- Booking one performance in two steps on one surface: Choose tickets, then Check and pay, with a
     marker saying which. The booking drawer and the performance's own page both draw this, so
     booking looks and works the same in each (Matt, 21 November 2026). -->
<script setup lang="ts">
const props = defineProps<{ performanceId: string, /** Shows the second step's title; the drawer keeps it for screen readers only. */ headed?: boolean }>()
const { t } = useT()

const step = ref<'choose' | 'pay'>('choose')
const changing = ref(false)
const payTitle = ref('')
const steps = computed(() => [
  { label: t('box-office.drawer.step-tickets'), current: step.value === 'choose' },
  { label: t('box-office.drawer.step-pay'), current: step.value === 'pay' },
])
// Each step starts at its top, wherever the last one was left.
const top = useTemplateRef<HTMLElement>('top')
watch(step, () => nextTick(() => top.value?.scrollIntoView({ block: 'nearest' })))
</script>

<template>
  <div>
    <ol
      ref="top"
      class="mb-5 flex scroll-mt-24 flex-wrap items-center gap-2 text-sm"
      :aria-label="t('box-office.drawer.steps')"
    >
      <li
        v-for="(s, i) in steps"
        :key="s.label"
        class="flex items-center gap-2"
        :aria-current="s.current ? 'step' : undefined"
      >
        <UIcon
          v-if="i > 0"
          name="i-lucide-chevron-right"
          class="text-dimmed"
          aria-hidden="true"
        />
        <span :class="s.current ? 'font-semibold text-highlighted' : 'text-muted'">{{ s.label }}</span>
      </li>
    </ol>
    <Suspense>
      <BoxOfficeChooseTickets
        v-if="step === 'choose'"
        :key="`choose-${props.performanceId}`"
        :performance-id="props.performanceId"
        :changing="changing"
        drawer
        @held="step = 'pay'"
      />
      <div
        v-else
        :key="`pay-${props.performanceId}`"
      >
        <h2
          v-if="payTitle"
          :class="headed ? 'mb-4 text-xl font-semibold text-highlighted' : 'sr-only'"
        >
          {{ payTitle }}
        </h2>
        <BoxOfficeCheckout
          drawer
          @title="payTitle = $event"
          @change="changing = true; step = 'choose'"
          @released="changing = false; step = 'choose'"
        />
      </div>
      <template #fallback>
        <p class="text-muted">
          {{ t('box-office.drawer.loading') }}
        </p>
      </template>
    </Suspense>
  </div>
</template>
