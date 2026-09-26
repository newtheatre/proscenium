<script setup lang="ts">
import type { DoorVerdict } from '#shared/utils/door'

// The whole of what door mode shows (E-129 criterion 7). Over the viewfinder while the camera is
// open, in place of the field where there is none; the same card either way.
defineProps<{ verdict: DoorVerdict, reference: string, party: string | null, access?: string | null, overlay?: boolean }>()
const emit = defineEmits<{ dismiss: [] }>()

const cardClass: Record<DoorVerdict['state'], string> = {
  PAID: 'border-success bg-success/10 text-success',
  UNPAID: 'border-secondary bg-secondary/10 text-secondary',
  REFUSED: 'border-error bg-error/10 text-error',
  UNANSWERED: 'border-warning bg-warning/10 text-warning',
  MISS: 'border-warning bg-warning/10 text-warning',
}

const cardIcon: Record<DoorVerdict['state'], string> = {
  PAID: 'i-lucide-circle-check',
  UNPAID: 'i-lucide-circle-alert',
  REFUSED: 'i-lucide-circle-x',
  UNANSWERED: 'i-lucide-wifi-off',
  MISS: 'i-lucide-search-x',
}
</script>

<template>
  <div
    class="pointer-events-auto flex w-full flex-col gap-2"
    :class="overlay ? 'size-full rounded-xl bg-default p-1' : ''"
    role="status"
    aria-live="polite"
    data-test="door-verdict"
    @click="emit('dismiss')"
  >
    <div
      class="flex grow flex-col items-center justify-center gap-3 rounded-2xl border-2 p-6 text-center"
      :class="[cardClass[verdict.state], overlay ? 'h-full' : 'min-h-[45vh]']"
      :data-test="`door-verdict-${verdict.state.toLowerCase()}`"
    >
      <UIcon
        :name="cardIcon[verdict.state]"
        class="size-16"
      />
      <p
        v-if="reference"
        class="font-mono text-lg tracking-widest text-muted"
        data-test="door-verdict-reference"
      >
        {{ reference }}
      </p>
      <p class="nnt-headline text-5xl font-bold">
        {{ verdict.headline }}
      </p>
      <p class="text-xl font-semibold text-default">
        {{ verdict.line }}
      </p>
      <UBadge
        v-if="party"
        color="neutral"
        variant="subtle"
        size="lg"
        data-test="door-verdict-party"
      >
        {{ party }}
      </UBadge>
      <!-- The wording the Accessibility Officer agreed, and nothing behind it (D-127 criterion 3). -->
      <p
        v-if="access"
        class="flex items-center gap-2 rounded-lg bg-default px-3 py-2 text-base font-semibold text-default"
        data-test="door-verdict-access"
      >
        <UIcon
          name="i-lucide-accessibility"
          class="size-5 shrink-0"
        />
        {{ access }}
      </p>
      <p
        v-if="verdict.note"
        class="text-sm text-muted"
      >
        {{ verdict.note }}
      </p>
    </div>

    <p class="text-center text-xs text-muted">
      Tap to clear
    </p>
  </div>
</template>
