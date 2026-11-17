<!-- Scan a code with the device's camera: a button that opens the camera in a dialog and reads the
     first QR code it sees. Most people have no barcode scanner, but every phone and most laptops have
     a camera. useCodeCamera does the reading, on the device: nothing is sent anywhere. Typing stays the fallback on every
     screen that uses this, so a missing camera, a refused permission or a page that is not secure
     never stops anyone; the dialog says which it was.

     With `continuous`, the dialog stays open and reads one code after another, as at the door; the
     same code is not read twice in a row within a few seconds, so a ticket held up to the camera is
     scanned once. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** The button's words, when "Scan with camera" is not right. */
  label?: string
  /** Keep scanning after a read, for scanning many codes in a row. */
  continuous?: boolean
  disabled?: boolean
  /** Shown under the picture while it is open: the last result, so a door can scan without looking away. */
  status?: string | null
  statusColor?: 'success' | 'warning' | 'error' | 'neutral'
  /** A box in the dialog to type a code instead, for a screen with nowhere else to type one. */
  typing?: boolean
  /** Only the icon, with the words in a hint, to sit beside a field's own button. */
  iconOnly?: boolean
}>(), { label: undefined, continuous: false, disabled: false, status: null, statusColor: 'neutral', typing: false, iconOnly: false })
const emit = defineEmits<{ scanned: [code: string] }>()

const { t } = useT()
const words = computed(() => props.label ?? t('core.scan.button'))
const open = ref(false)
const video = ref<HTMLVideoElement | null>(null)
const typed = ref('')
function submitTyped() {
  const code = typed.value.trim()
  if (!code) return
  typed.value = ''
  emit('scanned', code)
  if (!props.continuous) open.value = false
}
const { problem, starting } = useCodeCamera(video, open, (code) => {
  emit('scanned', code)
  if (props.continuous) return undefined
  open.value = false
  return 'stop'
})
</script>

<template>
  <IconButton
    v-if="iconOnly"
    icon="i-lucide-scan-qr-code"
    variant="outline"
    :label="words"
    :disabled="disabled"
    @click="open = true"
  />
  <UButton
    v-else
    icon="i-lucide-scan-qr-code"
    color="neutral"
    variant="outline"
    :label="words"
    :disabled="disabled"
    @click="open = true"
  />
  <UModal
    v-model:open="open"
    :title="t('core.scan.title')"
    :description="t('core.scan.description')"
  >
    <template #body>
      <div class="space-y-3">
        <UAlert
          v-if="problem"
          color="warning"
          variant="subtle"
          icon="i-lucide-camera-off"
          role="alert"
          :title="t(`core.scan.problem.${problem}`)"
          :description="t(typing ? 'core.scan.problem.type-below' : 'core.scan.problem.type-instead')"
        />
        <div
          v-else
          class="relative overflow-hidden rounded-md bg-black"
        >
          <video
            ref="video"
            class="aspect-square w-full object-cover"
            muted
            playsinline
            :aria-label="t('core.scan.camera')"
          />
          <div
            class="pointer-events-none absolute inset-[15%] rounded-lg border-2 border-white/80"
            aria-hidden="true"
          />
          <p
            v-if="starting"
            class="absolute inset-0 flex items-center justify-center text-sm text-white"
          >
            {{ t('core.scan.starting') }}
          </p>
        </div>
        <UForm
          v-if="typing"
          class="flex items-end gap-2"
          :state="{ typed }"
          novalidate
          @submit="submitTyped"
        >
          <UFormField
            :label="t('core.scan.type-label')"
            class="grow"
          >
            <UInput
              v-model="typed"
              autocomplete="off"
            />
          </UFormField>
          <UButton
            type="submit"
            color="neutral"
            variant="outline"
            :label="t('core.scan.type-submit')"
            :disabled="!typed.trim()"
          />
        </UForm>
        <UAlert
          v-if="status"
          :color="statusColor"
          variant="subtle"
          role="status"
          :title="status"
        />
      </div>
    </template>
  </UModal>
</template>
