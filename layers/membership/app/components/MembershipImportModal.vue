<!-- Importing members from a file (MEM-49): tried first, then queued once the officer has seen the
     outcome. Members who have already ended are counted apart, and may be left out. Opened from a
     scheme's menu (that scheme) and from Console > Members (the secretary picks one). -->
<script setup lang="ts">
import type { MembershipSchemeChoice } from '../../shared/scheme-choice'

interface Imported { queued: number, wouldImport?: number, alreadyEnded?: number, refused: { line: number, reason: string }[] }

const props = defineProps<{ schemes: MembershipSchemeChoice[], schemeId?: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()

const choices = computed(() => props.schemes.filter(s => s.canImport))
const chosen = ref('')
const file = ref<File | null>(null)
const skipEnded = ref(false)
const preview = ref<Imported | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

watch(open, (now) => {
  if (!now) return
  file.value = null
  preview.value = null
  refusal.value = null
  skipEnded.value = false
  chosen.value = props.schemeId && choices.value.some(s => s.id === props.schemeId) ? props.schemeId : choices.value.length === 1 ? choices.value[0]!.id : ''
})

async function send(dryRun: boolean): Promise<Imported | null> {
  refusal.value = null
  try {
    return await $api<Imported>(`/api/membership/schemes/${chosen.value}/import` as string, { method: 'POST', body: { file: await file.value!.text(), dryRun, skipEnded: skipEnded.value } })
  }
  catch (e) {
    refusal.value = toRefusal(e)
    return null
  }
}
async function tryFile() {
  preview.value = file.value && chosen.value ? await send(true) : null
}
watch([file, chosen, skipEnded], tryFile)
async function run() {
  const done = await send(false)
  if (!done) return
  toast.add({ title: t('membership.screens.import.queued', { count: done.queued }), description: t('membership.screens.import.queued-help'), color: 'success' })
  open.value = false
  emit('imported')
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('membership.screens.import.title')"
    :description="t('membership.screens.import.help')"
  >
    <template #body>
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
        <UFormField
          v-if="choices.length > 1"
          :label="t('membership.screens.import.scheme')"
          required
        >
          <USelectMenu
            v-model="chosen"
            value-key="value"
            :items="choices.map(s => ({ value: s.id, label: s.name }))"
            :placeholder="t('membership.screens.add-member.scheme-placeholder')"
          />
        </UFormField>
        <UFileUpload
          v-model="file"
          accept=".csv,text/csv,text/plain"
          :label="t('membership.screens.import.file')"
          :description="t('membership.screens.import.file-help')"
          class="w-full"
        />
        <UAlert
          v-if="preview"
          :color="preview.refused.length || preview.alreadyEnded ? 'warning' : 'success'"
          variant="subtle"
          :title="t('membership.screens.import.would-import', { count: preview.wouldImport ?? 0 })"
        >
          <template
            v-if="preview.refused.length || preview.alreadyEnded"
            #description
          >
            <p v-if="preview.alreadyEnded">
              {{ t('membership.screens.import.already-ended', { count: preview.alreadyEnded }) }}
            </p>
            <p v-if="preview.refused.length">
              {{ t('membership.screens.import.refused', { count: preview.refused.length }) }}
            </p>
            <ul
              v-if="preview.refused.length"
              class="list-disc ps-5"
            >
              <li
                v-for="r in preview.refused.slice(0, 10)"
                :key="r.line"
              >
                {{ t('membership.screens.list.refused-line', { line: r.line, reason: t(`membership.screens.import.reasons.${r.reason}`) }) }}
              </li>
            </ul>
          </template>
        </UAlert>
        <USwitch
          v-if="preview?.alreadyEnded"
          v-model="skipEnded"
          :label="t('membership.screens.import.skip-ended')"
          :description="t('membership.screens.import.skip-ended-help')"
        />
      </div>
    </template>
    <template #footer>
      <UButton
        icon="i-lucide-file-up"
        loading-auto
        :disabled="!preview?.wouldImport"
        :label="t('membership.screens.import.submit')"
        @click="run"
      />
    </template>
  </UModal>
</template>
