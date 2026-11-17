<!-- Import past awards of one type from a file: tried first, so the officer sees what would import
     and which rows would be refused, then queued. Nobody is told of an imported award. -->
<script setup lang="ts">
interface Imported { queued: number, wouldImport?: number, refused: { line: number, reason: string }[] }

const props = defineProps<{ types: { id: string, name: string }[], typeId?: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const chosen = ref('')
const file = ref<File | null>(null)
const preview = ref<Imported | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(open, (now) => {
  if (!now) return
  chosen.value = props.typeId ?? props.types[0]?.id ?? ''
  file.value = null
  preview.value = null
  refusal.value = null
})

async function send(dryRun: boolean): Promise<Imported | null> {
  refusal.value = null
  try {
    return await $api<Imported>(`/api/awards/types/${chosen.value}/import` as string, { method: 'POST', body: { file: await file.value!.text(), dryRun } })
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return null
  }
}
watch([file, chosen], async () => {
  preview.value = file.value && chosen.value ? await send(true) : null
})
async function run() {
  const done = await send(false)
  if (!done) return
  toast.add({ title: t('awards.screens.import.queued', { count: done.queued }), description: t('awards.screens.import.queued-help'), color: 'success' })
  open.value = false
  emit('imported')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('awards.screens.import.title')"
    :description="t('awards.screens.import.help')"
  >
    <template #body>
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
        <UFormField :label="t('awards.screens.issue.type')">
          <USelect
            v-model="chosen"
            :items="types.map(x => ({ value: x.id, label: x.name }))"
          />
        </UFormField>
        <UFileUpload
          v-model="file"
          accept=".csv,text/csv,text/plain"
          :label="t('awards.screens.import.file')"
          :description="t('awards.screens.import.file-help')"
          class="w-full"
        />
        <UAlert
          v-if="preview"
          :color="preview.refused.length ? 'warning' : 'success'"
          variant="subtle"
          :title="t('awards.screens.import.would-import', { count: preview.wouldImport ?? 0 })"
        >
          <template
            v-if="preview.refused.length"
            #description
          >
            <p>{{ t('awards.screens.import.refused', { count: preview.refused.length }) }}</p>
            <ul class="list-disc ps-5">
              <li
                v-for="r in preview.refused.slice(0, 10)"
                :key="r.line"
              >
                {{ t('awards.screens.import.refused-line', { line: r.line, reason: t(`awards.screens.import.reasons.${r.reason}`) }) }}
              </li>
            </ul>
          </template>
        </UAlert>
      </div>
    </template>
    <template #footer>
      <UButton
        icon="i-lucide-file-up"
        loading-auto
        :disabled="!preview?.wouldImport"
        :label="t('awards.screens.import.submit')"
        @click="run"
      />
    </template>
  </UModal>
</template>
