<script setup lang="ts">
// Cancelling a whole production (part 3): a reason is chosen, and what it touches is shown first,
// its own performances still to come and every module's lines. A module's refusal stops it, with
// a link to where the matter is settled.
interface Reach { lines: string[], refusal: { code: string, reason: string, link: string | null } | null }

const props = defineProps<{ productionId: string, title: string, reasons: { id: string, label: string }[] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ cancelled: [] }>()

const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const reach = ref<Reach | null>(null)
const form = ref({ reasonTermId: '', note: '' })
const items = computed(() => props.reasons.map(r => ({ value: r.id, label: r.label })))

watch(open, async (v) => {
  if (!v) return
  refusal.value = null
  reach.value = null
  form.value = { reasonTermId: '', note: '' }
  try {
    reach.value = await $api<Reach>(`/api/core/productions/${props.productionId}/impact` as string, { query: { kind: 'cancel' } })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
})

async function cancel() {
  refusal.value = null
  try {
    const answer = await $api<{ performances: number }>(`/api/core/productions/${props.productionId}/cancel` as string, { method: 'POST', body: form.value })
    open.value = false
    emit('cancelled')
    toast.add({ title: 'Production cancelled', description: answer.performances ? `${answer.performances} performances were cancelled with it.` : undefined, color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Cancel production"
    :description="`Cancel ${title}? It shows as cancelled at its address.`"
  >
    <template #body>
      <UForm
        id="cancel-production"
        class="space-y-4"
        :state="form"
        novalidate
        @submit="cancel"
      >
        <RefusalNotice :refusal="refusal" />
        <UAlert
          v-if="reach?.refusal"
          color="error"
          icon="i-lucide-circle-x"
          :title="reach.refusal.reason"
        >
          <template
            v-if="reach.refusal.link"
            #description
          >
            <ULink :to="reach.refusal.link">
              See what is holding it
            </ULink>
          </template>
        </UAlert>
        <ul
          v-if="reach?.lines.length"
          class="list-disc space-y-1 ps-5 text-sm"
        >
          <li
            v-for="line in reach.lines"
            :key="line"
          >
            {{ line }}
          </li>
        </ul>
        <UFormField
          label="Reason"
          required
        >
          <USelect
            v-model="form.reasonTermId"
            :items="items"
            placeholder="Choose a reason"
          />
        </UFormField>
        <UFormField
          label="Note"
          help="Kept with each cancelled performance, for the team."
        >
          <UTextarea
            v-model="form.note"
            :rows="2"
            maxlength="200"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="cancel-production"
        label="Cancel production"
        color="error"
        :disabled="!form.reasonTermId || !!reach?.refusal"
      />
    </template>
  </UModal>
</template>
