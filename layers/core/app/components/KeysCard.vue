<!-- The shared keys form (Matt, 17 November: every configurable key is managed in the app). A page
     drops it in with the names of the credentials that belong to it, and it does the rest: loads
     where each value comes from now, takes new values, saves them together, and removes a saved one
     after asking. A key is never shown again once saved: a set key's field is filled with dots between its
     prefix and last four characters (sk_live_••••4242) and says where it comes from (saved here, the
     Worker secret in Cloudflare), and Replace opens it to type a new one. Saving
     asks the person to confirm it is them. A credential declared confirm: true (replacing it breaks
     what the old value made) asks before it is replaced or removed. Keys the viewer may not manage
     are left out, and with none left the card is not drawn. -->
<script setup lang="ts">
interface Key {
  name: string
  module: string
  source: 'saved' | 'saved-for-module' | 'worker-secret' | null
  hint: string | null
  labelKey: string
  helpKey: string
  confirm: boolean
}

const props = defineProps<{
  /** The credentials this page manages, by name (`CORE_TURNSTILE_SECRET_KEY`). */
  names: string[]
  /** The card's heading; "Keys" when left out. */
  title?: string
  /** A line under the heading saying where the keys come from. */
  description?: string
}>()
/** After keys are saved or removed, with their names, so the page can refresh what depends on them. */
const emit = defineEmits<{ saved: [names: string[]] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const toast = useToast()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const { data, refresh } = await useAPI<{ keys: Key[] }>('/api/core/credentials', {
  query: { names: props.names.join(',') },
  key: `core:credentials:${props.names.join(',')}`,
})

const keys = computed(() => data.value?.keys ?? [])
const items = computed(() => keys.value.map(k => ({ ...k, label: t(k.labelKey), help: t(k.helpKey) })))
const typed = ref<Record<string, string>>({})
const saving = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const entered = computed(() => Object.fromEntries(Object.entries(typed.value).map(([name, value]) => [name, value.trim()]).filter(([, value]) => value)))
const anyTyped = computed(() => Object.keys(entered.value).length > 0)

async function send(body: Record<string, string | null>, done: string) {
  saving.value = true
  refusal.value = null
  try {
    await $api('/api/core/credentials', { method: 'POST', body: { keys: body } })
    typed.value = {}
    toast.add({ title: t(done), color: 'success', icon: 'i-lucide-circle-check' })
    await refresh()
    emit('saved', Object.keys(body))
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}

/** Asks first for a key whose replacement breaks what the old one made, when one is in use now. */
async function sure(names: string[], removing: boolean): Promise<boolean> {
  const risky = keys.value.filter(k => names.includes(k.name) && k.confirm && k.source)
  if (!risky.length) return true
  return await confirm({
    verb: removing ? t('core.credentials.remove-verb') : t('core.credentials.replace-verb'),
    thing: risky.map(k => t(k.labelKey)).join(', '),
    consequence: risky.map(k => t(`${k.labelKey.replace(/\.label$/, '')}.replace-warning`)).join(' '),
    button: removing ? t('core.credentials.remove-button') : t('core.credentials.replace-button'),
  })
}

async function save() {
  if (!anyTyped.value || saving.value) return
  if (!(await sure(Object.keys(entered.value), false))) return
  await send(entered.value, 'core.credentials.saved-toast')
}

async function remove(name: string) {
  const key = keys.value.find(k => k.name === name)
  if (!key) return
  const asked = key.confirm
    ? await sure([name], true)
    : await confirm({
        verb: t('core.credentials.remove-verb'),
        thing: t(key.labelKey),
        consequence: t('core.credentials.remove-body'),
        button: t('core.credentials.remove-button'),
      })
  if (asked) await send({ [name]: null }, 'core.credentials.removed-toast')
}
</script>

<template>
  <UForm
    v-if="keys.length"
    :state="typed"
    novalidate
    @submit="save"
  >
    <PageSection
      :title="title ?? t('core.credentials.title')"
      :description="description ?? t('core.credentials.description')"
    >
      <RefusalNotice :refusal="refusal" />
      <CredentialFields
        v-model="typed"
        :items="items"
        :disabled="saving"
        @remove="remove"
      />
      <template #footer>
        <UButton
          type="submit"
          icon="i-lucide-key-round"
          :label="t('core.credentials.save')"
          :loading="saving"
          :disabled="!anyTyped || saving"
        />
      </template>
    </PageSection>
  </UForm>
</template>
