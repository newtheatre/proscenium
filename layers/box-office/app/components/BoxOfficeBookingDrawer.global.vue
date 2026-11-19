<!-- Booking over the show's page (concept A, "Spotlight"): Choose tickets and then Check and pay in a
     drawer from the side, so the show stays in view. Both steps are the pages' own components, so ID
     boxes, passes and the countdown work exactly as on the pages. Global, as the public pages open it
     by the name in core.booking-action's `drawer`, given the performance's booking link. -->
<script setup lang="ts">
const props = defineProps<{ link: string, title: string, when: string }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useT()

// The link is this module's own (/book/<production>/<performance>); its last part is the performance.
const performanceId = computed(() => props.link.split('?')[0]!.split('/').filter(Boolean).at(-1) ?? '')
const step = ref<'choose' | 'pay'>('choose')
const changing = ref(false)
const payTitle = ref('')
// Each opening starts at Choose tickets, which offers to carry on with seats already held.
watch(open, (value) => {
  if (!value) return
  step.value = 'choose'
  changing.value = false
})
const steps = computed(() => [
  { label: t('box-office.drawer.step-tickets'), current: step.value === 'choose' },
  { label: t('box-office.drawer.step-pay'), current: step.value === 'pay' },
])
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :description="when"
    :ui="{ content: 'sm:max-w-lg', body: 'sm:p-6' }"
  >
    <template #body>
      <ol
        class="mb-5 flex flex-wrap items-center gap-2 text-sm"
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
          :key="`choose-${performanceId}`"
          :performance-id="performanceId"
          :changing="changing"
          drawer
          @held="step = 'pay'"
        />
        <div
          v-else
          :key="`pay-${performanceId}`"
        >
          <h3
            v-if="payTitle"
            class="sr-only"
          >
            {{ payTitle }}
          </h3>
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
    </template>
  </USlideover>
</template>
