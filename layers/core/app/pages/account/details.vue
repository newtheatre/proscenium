<!-- Your details (ID-11; identity spec part 6): the name and pronouns,
     and for a member their emergency contacts (ID-17).
     Everything that shows the person reads the account, so after saving the app's data is fetched
     again and the header shows the new name at once. -->
<script setup lang="ts">
import { z } from 'zod'
import type { RefusalView } from '../../utils/refusal'

interface Me { signedIn: boolean, account?: { name: string | null, pronouns: string | null } }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<Me>('/api/core/me', { key: 'core:me' })

// The same limits as the route's.
const schema = z.object({
  name: z.string().trim().min(1).max(120),
  pronouns: z.string().trim().max(40),
})
const form = reactive({ name: '', pronouns: '' })
watch(() => data.value?.account, (a) => {
  if (a) Object.assign(form, { name: a.name ?? '', pronouns: a.pronouns ?? '' })
}, { immediate: true })

const saving = ref(false)
const refusal = ref<RefusalView | null>(null)

async function save() {
  saving.value = true
  refusal.value = null
  try {
    await $api('/api/core/me', { method: 'PATCH', body: { name: form.name.trim(), pronouns: form.pronouns.trim() || null } })
    toast.add({ title: t('core.me.details.saved'), color: 'success' })
    await refreshNuxtData()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.me.details.title')"
    :description="t('core.me.details.intro')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <UForm
        :schema="schema"
        :state="form"
        class="space-y-6"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="name"
          :label="t('core.me.details.name')"
          :help="t('core.me.details.name-help')"
          required
        >
          <UInput
            v-model="form.name"
            autocomplete="name"
            maxlength="120"
          />
        </UFormField>
        <UFormField
          name="pronouns"
          :label="t('core.me.details.pronouns')"
          :help="t('core.me.details.pronouns-help')"
        >
          <UInput
            v-model="form.pronouns"
            maxlength="40"
          />
        </UFormField>
        <UButton
          type="submit"
          :loading="saving"
          :label="t('core.me.details.save')"
        />
      </UForm>
      <MyEmergencyContacts class="mt-8" />
    </DataBoundary>
  </PageFrame>
</template>
