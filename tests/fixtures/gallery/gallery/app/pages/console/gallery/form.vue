<script setup lang="ts">
import { sampleSchema } from '../../../../server/sample-schema'

definePageMeta({ layout: 'console' })

const fields = [
  { name: 'name', label: 'Name', kind: 'text' as const },
  { name: 'email', label: 'Email address', kind: 'email' as const, help: 'We use this to send the confirmation.' },
  { name: 'quantity', label: 'Quantity', kind: 'number' as const },
  { name: 'notes', label: 'Notes', kind: 'textarea' as const, optional: true },
]
const route = useRoute()
const stale = computed(() => route.query.stale === '1')

async function submit(values: Record<string, unknown>, version?: string | number) {
  return await $fetch('/api/gallery/save', { method: 'POST', body: { ...values, version: stale.value && version !== 'fresh' ? 'stale' : version } })
}
const current = async () => await $fetch<{ values: Record<string, unknown>, version: string }>('/api/gallery/current')
</script>

<template>
  <PageForm
    title="Sample form"
    submit-label="Save booking"
    :schema="sampleSchema"
    :fields="fields"
    :initial="{ name: 'Hamlet', email: '', quantity: 2, notes: '' }"
    :submit="submit"
    :current="current"
    return-to="/console/gallery/list"
  />
</template>
