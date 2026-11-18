<!-- A file question as a respondent answers it (F03). Each file chosen is uploaded at once and
     checked by the platform; the answer is the list of files that passed. Where nothing is kept, as
     in the builder's preview, the question says so and takes no files. -->
<script setup lang="ts">
import type { FileRef, Question } from '../../shared/engine'
import { FORMS_UPLOADS } from '../composables/useFormsUploads'

const props = defineProps<{ question: Question }>()
const model = defineModel<unknown>()
const { t } = useT()
const { toRefusal } = useRefusal()
const uploads = inject(FORMS_UPLOADS, null)

const files = computed<FileRef[]>(() => Array.isArray(model.value) ? (model.value as FileRef[]).filter(f => f && typeof f === 'object' && 'id' in f) : [])
const checking = ref<Set<string>>(new Set())
const busy = ref(false)
const problem = ref('')
const input = useTemplateRef<HTMLInputElement>('input')

const rule = (name: string) => props.question.validation?.find(r => r.rule === name)?.value
const most = computed(() => typeof rule('maxFiles') === 'number' ? rule('maxFiles') as number : null)
const accept = computed(() => Array.isArray(rule('fileTypes')) ? (rule('fileTypes') as string[]).join(',') : '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp')
const full = computed(() => most.value !== null && files.value.length >= most.value)
const shown = computed(() => files.value.map(f => ({ ...f, status: checking.value.has(f.id) ? 'checking' as const : 'ready' as const })))

const REFUSED: Record<string, string> = { 'type-not-accepted': 'type', 'too-large': 'too-large', 'damaged': 'damaged' }

function set(next: FileRef[]) {
  model.value = next.length ? next : undefined
}
async function add(event: Event) {
  const target = event.target as HTMLInputElement
  const chosen = [...(target.files ?? [])]
  target.value = ''
  if (!uploads || !chosen.length) return
  problem.value = ''
  busy.value = true
  try {
    for (const file of chosen) {
      if (most.value !== null && files.value.length >= most.value) {
        problem.value = t('forms.screens.fill.file-most', { count: most.value })
        break
      }
      let ref: FileRef
      try {
        ref = await uploads.upload(props.question, file)
      }
      catch (e) {
        problem.value = t('forms.screens.fill.file-not-added', { name: file.name, reason: toRefusal(e).reason })
        continue
      }
      set([...files.value, ref])
      checking.value = new Set([...checking.value, ref.id])
      void uploads.settle(ref.id).then((done) => {
        const left = new Set(checking.value)
        left.delete(ref.id)
        checking.value = left
        if (done.state === 'rejected') {
          set(files.value.filter(f => f.id !== ref.id))
          problem.value = t('forms.screens.fill.file-refused', { name: ref.name, reason: t(`forms.screens.fill.file-refused-${REFUSED[done.reason ?? ''] ?? 'other'}`) })
        }
      })
    }
  }
  finally {
    busy.value = false
  }
}
const remove = (id: string) => set(files.value.filter(f => f.id !== id))
</script>

<template>
  <div class="space-y-2">
    <p
      v-if="!uploads"
      class="rounded-md border border-dashed border-default px-3 py-2 text-sm text-muted"
    >
      {{ t('forms.screens.fill.file-preview') }}
    </p>
    <template v-else>
      <FormsFileList
        v-if="shown.length"
        :files="shown"
        removable
        @remove="remove"
      />
      <input
        ref="input"
        type="file"
        class="sr-only"
        :accept="accept"
        :multiple="most === null || most > 1"
        :aria-label="t('forms.screens.fill.file-choose')"
        tabindex="-1"
        @change="add"
      >
      <UButton
        v-if="!full"
        icon="i-lucide-upload"
        color="neutral"
        variant="outline"
        :loading="busy"
        :label="files.length ? t('forms.screens.fill.file-another') : t('forms.screens.fill.file-choose')"
        @click="input?.click()"
      />
      <p class="text-xs text-muted">
        {{ t('forms.screens.fill.file-help') }}
      </p>
      <p
        v-if="problem"
        class="text-sm text-error"
        role="alert"
      >
        {{ problem }}
      </p>
    </template>
  </div>
</template>
