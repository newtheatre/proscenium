<!-- Apply, or answer, on somebody's behalf (ID-42): for a phone call or a visit. The form is the
     person's own, started from what they sent before; what is sent is marked as entered by the
     reviewer, the person is emailed, and another reviewer decides it. -->
<script setup lang="ts">
import type { AccessApplicationValue } from '../../../../../composables/useAccessApplicationForm'

definePageMeta({ layout: 'console' })

interface Opened {
  name: string
  application: { status: string, inForce: AccessApplicationValue | null, pending: AccessApplicationValue | null } | null
  needs: { id: string, label: string, retired: boolean }[]
  allowNote: boolean
}

const { t } = useT()
const { $api } = useNuxtApp()
const toast = useToast()
const route = useRoute()
const id = String(route.params.id)
const base = `/api/core/access-scheme/${encodeURIComponent(id)}`
const back = `/console/people/access-scheme/${encodeURIComponent(id)}`
const { data } = await useAPI<Opened>(base, { key: `core:access-application:${id}` })
if (!data.value) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })

const { schema, fields, toForm, toBody } = useAccessApplicationForm(
  () => data.value?.needs.filter(n => !n.retired) ?? [],
  () => data.value?.allowNote ?? false,
)
const app = data.value.application
const initial = toForm(app?.status === 'rejected' ? null : (app?.pending ?? app?.inForce))
useSeoMeta({ title: () => t('core.access.review.behalf') })

async function submit(values: Record<string, unknown>) {
  await $api<unknown>(`${base}/application` as string, { method: 'POST', body: toBody(values) })
  toast.add({ title: t('core.access.review.applied'), color: 'success' })
  await refreshNuxtData(`core:access-application:${id}`)
}
</script>

<template>
  <PageForm
    :title="t('core.access.review.behalf-for', { name: data?.name ?? t('core.access.queue.unnamed') })"
    :submit-label="t('core.access.review.send-behalf')"
    :schema="schema"
    :fields="fields"
    :initial="initial"
    :submit="submit"
    :return-to="back"
  />
</template>
