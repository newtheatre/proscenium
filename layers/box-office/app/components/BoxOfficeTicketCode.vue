<!-- One ticket or code to be scanned: its QR code, large enough for a camera, with the short number a
     person reads off it, and "Show full screen" for the door. A ticket issued before its code was kept
     has no code to show here: the buyer is pointed to their confirmation email. Used on Your booking,
     the screen after booking, and for a reservation's box office code. -->
<script setup lang="ts">
const props = defineProps<{
  /** What the camera reads. Null when the code is not kept, so only the email has it. */
  value: string | null
  /** What it is, shown above the code and read to screen readers: "Ticket 1 of 3". */
  title: string
  /** The short number a person reads, shown under the code. */
  number?: string
  /** A note under the number, such as "Already scanned in". */
  note?: string
}>()
const { t } = useT()
const open = ref(false)
const label = computed(() => props.number ? `${props.title}, ${props.number}` : props.title)
</script>

<template>
  <div class="flex flex-col items-center gap-2 rounded-lg border border-default p-4 text-center">
    <p class="font-semibold text-highlighted">
      {{ title }}
    </p>
    <template v-if="value">
      <QrCode
        :value="value"
        :label="label"
      />
      <p
        v-if="number"
        class="font-mono text-sm tracking-wide [overflow-wrap:anywhere]"
      >
        {{ number }}
      </p>
      <p
        v-if="note"
        class="text-sm text-muted"
      >
        {{ note }}
      </p>
      <UButton
        variant="outline"
        color="neutral"
        icon="i-lucide-maximize"
        :label="t('box-office.ticket-code.full-screen')"
        @click="open = true"
      />
      <UModal
        v-model:open="open"
        fullscreen
        :title="label"
      >
        <template #body>
          <div class="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
            <QrCode
              :value="value"
              :label="label"
              class="w-full!"
            />
            <p
              v-if="number"
              class="font-mono text-lg tracking-wide [overflow-wrap:anywhere]"
            >
              {{ number }}
            </p>
            <p class="text-sm text-muted">
              {{ t('box-office.ticket-code.brightness') }}
            </p>
          </div>
        </template>
      </UModal>
    </template>
    <template v-else>
      <p
        v-if="number"
        class="font-mono text-sm tracking-wide [overflow-wrap:anywhere]"
      >
        {{ number }}
      </p>
      <p class="text-sm text-muted">
        {{ t('box-office.ticket-code.in-email') }}
      </p>
    </template>
  </div>
</template>
