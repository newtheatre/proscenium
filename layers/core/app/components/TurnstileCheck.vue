<!-- Cloudflare Turnstile, the one bot check. Emits the token once the check passes, and an empty
     token when it runs out, so a form never sends a stale one. Nuxt's Turnstile module loads the
     script, resets the check before it expires and removes it with the component. With no site key
     the check is quietly off, as it is on the server with no secret. The site key is the setting on
     Admin > Sign-in. A token is good for one
     request: a page that sent one and was refused calls reset() (through a template ref) for a new one.
     A form sent before the check has passed waits for it with waitForToken(), rather than sending
     without a token and being refused. Such a form can pass `quiet`: the check then shows only when
     it needs the person to do something, and takes no room until then. -->
<script setup lang="ts">
const props = defineProps<{ quiet?: boolean }>()
const emit = defineEmits<{ token: [value: string] }>()
const { t } = useT()
const { data: publicSettings } = usePublicSettings()
const siteKey = computed(() => (publicSettings.value?.['core.sign-in.turnstile-site-key']?.value as string | null | undefined) || '')
const token = ref('')
const failed = ref(false)
// Whether the check is asking the person to do something. A quiet check is shown only then.
const interacting = ref(false)
const shown = computed(() => !props.quiet || interacting.value)
// How long a waiting form gives a check that has not loaded (a content blocker, say) before it
// stops waiting and says so. Not counted while the check is asking the person to do something.
const LOAD_WAIT_MS = 15_000 // not-policy: long enough for the script on a slow connection
let waiting: ((value: string) => void)[] = []
let giveUp: ReturnType<typeof setTimeout> | undefined

function settle(value: string) {
  clearTimeout(giveUp)
  giveUp = undefined
  const resolve = waiting
  waiting = []
  for (const r of resolve) r(value)
}

watch(token, (value) => {
  if (value) {
    failed.value = false
    settle(value)
  }
  emit('token', value)
})
const widget = useTemplateRef<{ reset: () => void }>('widget')
/** Runs the check again, for a page whose request used up the token. Emits an empty token at once. */
function reset() {
  token.value = ''
  failed.value = false
  widget.value?.reset()
}
const options = {
  'response-field': false,
  ...(props.quiet ? { appearance: 'interaction-only' } : {}),
  'expired-callback': () => { token.value = '' },
  'error-callback': () => {
    token.value = ''
    failed.value = true
    settle('')
  },
  'before-interactive-callback': () => {
    interacting.value = true
    clearTimeout(giveUp)
  },
}

/** The token, once the check has passed: at once when it has, or when the check is off. */
function waitForToken(): Promise<string> {
  if (!siteKey.value || token.value) return Promise.resolve(token.value)
  if (failed.value) return Promise.resolve('')
  return new Promise((resolve) => {
    waiting.push(resolve)
    if (!giveUp && !interacting.value) {
      giveUp = setTimeout(() => {
        failed.value = true
        settle('')
      }, LOAD_WAIT_MS)
    }
  })
}

onBeforeUnmount(() => settle(''))
defineExpose({ reset, waitForToken })
</script>

<template>
  <template v-if="siteKey">
    <!-- When quiet, out of the page's flow until the check asks for something: no empty block. -->
    <div :class="shown ? undefined : 'absolute'">
      <NuxtTurnstile
        ref="widget"
        v-model="token"
        :site-key="siteKey"
        :options="options"
      />
    </div>
    <UAlert
      v-if="failed"
      role="alert"
      color="error"
      icon="i-lucide-circle-alert"
      :title="t('core.challenge.unavailable')"
      :description="t('core.challenge.unavailable-remedy')"
    />
  </template>
</template>
