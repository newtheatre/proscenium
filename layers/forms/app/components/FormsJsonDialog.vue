<!-- The form as JSON: to read, copy, save as a file, or replace with a file or pasted text. What is
     applied is checked against the format first, and is one step that Undo reverses. -->
<script setup lang="ts">
import { parseDefinition, type Fault } from '../../shared/engine'

const props = defineProps<{ formId: string, slug: string }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useT()
const { $api } = useNuxtApp()
const toast = useToast()
const builder = useBuilder()
const text = ref('')
const faults = ref<Fault[]>([])
const broken = ref(false)
watch(open, (now) => {
  if (!now) return
  text.value = JSON.stringify(builder.definition.value, null, 2)
  faults.value = []
  broken.value = false
})
const MOST_SHOWN = 5 // not-policy: faults listed before "and n more"
function read(): unknown {
  const parsed = JSON.parse(text.value) as Record<string, unknown>
  // An exported file wraps the definition with its title; pasted text may be either.
  return parsed && parsed.file === 'proscenium.form' ? parsed.definition : parsed
}
function apply() {
  faults.value = []
  broken.value = false
  let input: unknown
  try { input = read() }
  catch { return void (broken.value = true) }
  const parsed = parseDefinition(input)
  if (!parsed.ok) return void (faults.value = parsed.faults)
  builder.apply(parsed.definition)
  builder.select(null)
  open.value = false
  toast.add({ title: t('forms.screens.json.applied'), color: 'success' })
}
async function copy() {
  await navigator.clipboard.writeText(text.value)
  toast.add({ title: t('forms.screens.json.copied'), color: 'neutral' })
}
async function download() {
  await builder.flush()
  const file = await $api(`/api/forms/forms/${props.formId}/export`)
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: `${props.slug}.form.json` })
  link.click()
  URL.revokeObjectURL(url)
}
async function load(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) text.value = await file.text()
}
const picker = useTemplateRef<HTMLInputElement>('picker')
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('forms.screens.json.title')"
    :description="t('forms.screens.json.help')"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-3">
        <UAlert
          v-if="broken"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('forms.screens.json.not-json')"
        />
        <UAlert
          v-if="faults.length"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="t('forms.screens.json.faults', { count: faults.length })"
        >
          <template #description>
            <ul class="list-disc ps-4">
              <li
                v-for="(f, i) in faults.slice(0, MOST_SHOWN)"
                :key="i"
              >
                <span class="font-mono">{{ f.path.join('.') || '/' }}</span>: {{ f.message }}
              </li>
              <li v-if="faults.length > MOST_SHOWN">
                {{ t('forms.screens.json.more', { count: faults.length - MOST_SHOWN }) }}
              </li>
            </ul>
          </template>
        </UAlert>
        <UTextarea
          v-model="text"
          :rows="18"
          spellcheck="false"
          :aria-label="t('forms.screens.json.title')"
          :ui="{ base: 'font-mono text-xs' }"
        />
        <input
          ref="picker"
          type="file"
          accept=".json,application/json"
          class="hidden"
          @change="load"
        >
      </div>
    </template>
    <template #footer>
      <UButton
        :label="t('forms.screens.json.apply')"
        icon="i-lucide-check"
        @click="apply"
      />
      <UButton
        :label="t('forms.screens.json.open-file')"
        icon="i-lucide-folder-open"
        color="neutral"
        variant="subtle"
        @click="picker?.click()"
      />
      <UButton
        :label="t('forms.screens.json.copy')"
        icon="i-lucide-copy"
        color="neutral"
        variant="subtle"
        @click="copy"
      />
      <UButton
        :label="t('forms.screens.json.download')"
        icon="i-lucide-download"
        color="neutral"
        variant="subtle"
        loading-auto
        @click="download"
      />
    </template>
  </UModal>
</template>
