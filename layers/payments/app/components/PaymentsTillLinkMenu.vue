<!-- The till's link menu (linked tills proposal, 19 November 2026): which devices share this sale,
     this device's name, disconnecting and linking again, and linking someone else's device with a
     code that one shows and the other types or scans. The till keeps the state; this shows it. -->
<script setup lang="ts">
const props = defineProps<{
  live?: boolean
  /** On a narrow strip: with nothing to report, the button is its icon alone. */
  compact?: boolean
  testid: string
  label: string
  linked: boolean
  solo: boolean
  others: { id: string, name: string }[]
  deviceName: string
  /** Whose till this device joined with a code, where it did. */
  host: string | null
  /** Joins another seller's till with their code; answers what went wrong, or null. */
  join: (code: string) => Promise<string | null>
}>()
const emit = defineEmits<{ rename: [string], disconnect: [], link: [], leave: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()

const name = ref(props.deviceName)
watch(() => props.deviceName, (now) => { name.value = now })

// The code this device shows, until it runs out.
const offer = ref<{ code: string, expiresAt: number } | null>(null)
const offerError = ref<string | null>(null)
let ending: ReturnType<typeof setTimeout> | undefined
async function showCode() {
  offerError.value = null
  try {
    offer.value = await $api<{ code: string, expiresAt: number }>('/api/payments/till/link-code', { method: 'POST', body: {} })
    clearTimeout(ending)
    ending = setTimeout(() => { offer.value = null }, Math.max(0, offer.value.expiresAt - Date.now()))
  }
  catch (e) {
    offerError.value = toRefusal(e).reason
  }
}
onBeforeUnmount(() => clearTimeout(ending))
// Scanned, the code opens this same till on the other device and links it.
const scanTo = computed(() => {
  if (!offer.value || !import.meta.client) return ''
  const url = new URL(location.href)
  url.search = ''
  url.searchParams.set('link', offer.value.code)
  return url.toString()
})
const spaced = computed(() => offer.value ? `${offer.value.code.slice(0, 3)} ${offer.value.code.slice(3)}` : '')

const typed = ref('')
const joinError = ref<string | null>(null)
async function submit() {
  const code = typed.value.replace(/\D/g, '')
  if (code.length !== 6) { // not-policy: a link code's length
    joinError.value = t('payments.screens.till.linked.code-six')
    return
  }
  joinError.value = await props.join(code)
  if (!joinError.value) typed.value = ''
}
</script>

<template>
  <UPopover>
    <UButton
      color="neutral"
      variant="outline"
      :size="live ? 'lg' : 'sm'"
      :icon="linked ? 'i-lucide-link' : 'i-lucide-unlink'"
      :label="label"
      :square="compact && !linked && !solo"
      :ui="{ label: compact && !linked && !solo ? 'sr-only' : '' }"
      :data-testid="testid"
    />
    <template #content>
      <div class="max-h-[80vh] w-80 max-w-[90vw] space-y-3 overflow-y-auto p-3 text-sm">
        <p class="font-medium text-highlighted">
          {{ host ? t('payments.screens.till.linked.title-joined', { name: host }) : t('payments.screens.till.linked.title') }}
        </p>
        <UFormField :label="t('payments.screens.till.linked.this-device')">
          <UInput
            v-model="name"
            maxlength="60"
            @change="emit('rename', name)"
          />
        </UFormField>
        <p
          v-if="!others.length"
          class="text-muted"
        >
          {{ host ? t('payments.screens.till.linked.none-joined', { name: host }) : t('payments.screens.till.linked.none') }}
        </p>
        <ul
          v-else
          class="space-y-1"
        >
          <li
            v-for="d in others"
            :key="d.id"
            class="flex items-center justify-between gap-2"
          >
            <span class="min-w-0 truncate">{{ d.name }}</span>
            <StatusBadge
              :tone="solo ? 'neutral' : 'success'"
              :label="solo ? t('payments.screens.till.linked.not-linked') : t('payments.screens.till.linked.in-sync')"
            />
          </li>
        </ul>
        <p class="text-muted">
          {{ solo ? t('payments.screens.till.linked.help-solo') : host ? t('payments.screens.till.linked.help-joined', { name: host }) : t('payments.screens.till.linked.help-linked') }}
        </p>
        <UButton
          v-if="solo"
          block
          icon="i-lucide-link"
          :label="t('payments.screens.till.linked.link')"
          @click="emit('link')"
        />
        <UButton
          v-else
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-unlink"
          :label="t('payments.screens.till.linked.disconnect')"
          @click="emit('disconnect')"
        />
        <UButton
          v-if="host"
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-log-out"
          :label="t('payments.screens.till.linked.leave', { name: host })"
          data-testid="till-link-leave"
          @click="emit('leave')"
        />
        <template v-else>
          <USeparator />
          <p class="font-medium text-highlighted">
            {{ t('payments.screens.till.linked.someone-else') }}
          </p>
          <div
            v-if="offer"
            class="flex flex-col items-center gap-2"
          >
            <p
              class="font-mono text-3xl font-semibold tracking-widest text-highlighted"
              data-testid="till-link-code"
            >
              {{ spaced }}
            </p>
            <QrCode
              :value="scanTo"
              :label="t('payments.screens.till.linked.code-qr')"
            />
            <p class="text-center text-muted">
              {{ t('payments.screens.till.linked.code-help') }}
            </p>
          </div>
          <template v-else>
            <p class="text-muted">
              {{ t('payments.screens.till.linked.someone-else-help') }}
            </p>
            <UButton
              block
              color="neutral"
              variant="outline"
              icon="i-lucide-qr-code"
              loading-auto
              :label="t('payments.screens.till.linked.show-code')"
              data-testid="till-link-show"
              @click="showCode"
            />
            <p
              v-if="offerError"
              class="text-error"
            >
              {{ offerError }}
            </p>
          </template>
          <UForm
            :state="{ typed }"
            class="space-y-2"
            novalidate
            @submit="submit"
          >
            <UFormField
              name="typed"
              :label="t('payments.screens.till.linked.enter-code')"
              :error="joinError ?? undefined"
            >
              <UInput
                v-model="typed"
                inputmode="numeric"
                autocomplete="off"
                maxlength="7"
                placeholder="000 000"
                data-testid="till-link-enter"
              />
            </UFormField>
            <UButton
              block
              type="submit"
              color="neutral"
              variant="outline"
              loading-auto
              :label="t('payments.screens.till.linked.join')"
            />
          </UForm>
        </template>
      </div>
    </template>
  </UPopover>
</template>
