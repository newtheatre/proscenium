<!-- The access scheme's application, filled in at the till with somebody who has never applied, for
     a ticket that needs the scheme such as a wheelchair space. It is the person's own form, the one
     a reviewer fills in on their behalf; sent from here it is marked as made by staff, the person is
     emailed, and a reviewer decides it. Meanwhile it is enough to sell them a wheelchair space, with
     the booking flagged for staff (Matt, 2026-11-17). The form starts with "I use a wheelchair and
     stay in it" ticked, as that is what a wheelchair space is for; the seller changes it if not. -->
<script setup lang="ts">
const props = defineProps<{ performanceId: string, accountId: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'applied'): void }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
interface Form { accountId: string, label: string, applied: boolean, needs: { id: string, key: string, label: string, description: string | null, group: string | null }[], allowNote: boolean }
const form = ref<Form | null>(null)
const error = ref<string | null>(null)

const { schema, fields, toForm, toBody } = useAccessApplicationForm(() => form.value?.needs ?? [], () => form.value?.allowNote ?? false)
const initial = computed(() => {
  const chair = form.value?.needs.find(n => n.key === 'wheelchair-stays') // not-policy: the scheme's term for staying in a wheelchair
  return toForm(chair ? { needs: [{ term: chair.id }], companions: 0 } : null)
})

watch(open, async (now) => {
  if (!now) return
  error.value = null
  try {
    form.value = await $api<Form>('/api/box-office/desk/access-application', { query: { performanceId: props.performanceId, accountId: props.accountId } })
  }
  catch (e) {
    error.value = toRefusal(e).reason
  }
}, { immediate: true })

async function submit(values: Record<string, unknown>) {
  return $api('/api/box-office/desk/access-application', { method: 'POST', body: { performanceId: props.performanceId, accountId: props.accountId, application: toBody(values) } })
}
</script>

<template>
  <UAlert
    v-if="open && error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    :title="error"
  />
  <PageForm
    v-else-if="form"
    :key="form.accountId"
    v-model:open="open"
    always-panel
    :title="t('box-office.screens.panel.access.title', { name: form.label })"
    :description="t('box-office.screens.panel.access.description')"
    :submit-label="t('box-office.screens.panel.access.send')"
    :saved-title="t('box-office.screens.panel.access.sent', { name: form.label })"
    :schema="schema"
    :fields="fields"
    :initial="initial"
    :submit="submit"
    @saved="emit('applied')"
  />
</template>
