<!-- The access scheme's application form in My account (ID-38; identity spec part 6): a first
     application, an answer to the reviewer's question, or a change. It starts from what was sent
     before. With the scheme off it is a missing page. -->
<script setup lang="ts">
import type { AccessApplicationValue } from '../../../composables/useAccessApplicationForm'

interface Mine {
  enabled: boolean
  name?: string
  allowNote?: boolean
  needs?: { id: string, key: string, label: string, description: string | null }[]
  application?: {
    status: 'submitted' | 'more-info' | 'accepted' | 'rejected'
    inForce: AccessApplicationValue | null
    pending: AccessApplicationValue | null
  } | null
}

const { t } = useT()
const { $api } = useNuxtApp()
const toast = useToast()
const { data } = await useAPI<Mine>('/api/core/me/access', { key: 'core:my-access' })
if (!data.value?.enabled) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })

const application = computed(() => data.value?.application ?? null)
const { schema, fields, toForm, toBody } = useAccessApplicationForm(() => data.value?.needs ?? [], () => !!data.value?.allowNote)
const initial = toForm(application.value?.status === 'rejected' ? null : (application.value?.pending ?? application.value?.inForce))
useSeoMeta({ title: () => data.value?.name ?? '' })

async function submit(values: Record<string, unknown>) {
  await $api('/api/core/me/access', { method: 'POST', body: toBody(values) })
  toast.add({ title: t('core.access.sent'), color: 'success' })
  await refreshNuxtData('core:my-access')
}
</script>

<template>
  <PageForm
    :title="data?.name ?? ''"
    :description="t('core.access.form.who-reads-detail')"
    :submit-label="application && application.status !== 'rejected' ? t('core.access.form.send-change') : t('core.access.form.send')"
    :schema="schema"
    :fields="fields"
    :initial="initial"
    :submit="submit"
    return-to="/account/access"
  />
</template>
