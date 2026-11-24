<!-- One route in K8's editor: its name and what it needs, every item held at once (R2). An item is a
     course or something another module recognises, such as an outside certificate (R5). -->
<script setup lang="ts">
import type { RouteDraft, RouteItemDraft } from '../composables/useRouteEditor'
import type { RouteOptions } from '../../server/console-competencies'

const props = defineProps<{ route: RouteDraft | null, options: RouteOptions }>()
const emit = defineEmits<{ done: [route: RouteDraft], close: [] }>()
const { t } = useT()
const form = reactive<{ label: string, items: RouteItemDraft[] }>({ label: '', items: [] })
const adding = ref<string | undefined>()
const open = computed({ get: () => !!props.route, set: (v) => { if (!v) emit('close') } })
watch(() => props.route, (r) => {
  if (!r) return
  form.label = r.label
  form.items = r.items.map(i => ({ ...i }))
  adding.value = undefined
}, { immediate: true })

const keyOf = (i: RouteItemDraft) => i.kind === 'course' ? `course:${i.courseId}` : `recognised:${i.requirementRef}`
type Choice = { type?: 'label', label: string, value?: string }
const choices = computed<Choice[][]>(() => {
  const taken = new Set(form.items.map(keyOf))
  const group = (kind: 'course' | 'recognised', list: { value: string, label: string }[]) => list
    .map(o => ({ value: `${kind}:${o.value}`, label: o.label }))
    .filter(o => !taken.has(o.value))
  return [
    [{ type: 'label' as const, label: t('training.route-editor.courses') }, ...group('course', props.options.courses)],
    ...(props.options.recognised.length ? [[{ type: 'label' as const, label: t('training.route-editor.recognised') }, ...group('recognised', props.options.recognised)]] : []),
  ]
})
watch(adding, (value) => {
  if (!value) return
  const [kind, ...rest] = value.split(':')
  const ref = rest.join(':')
  const label = choices.value.flat().find(o => o.value === value)?.label ?? ref
  form.items.push(kind === 'course' ? { kind: 'course', courseId: ref, label } : { kind: 'recognised', requirementRef: ref, label })
  nextTick(() => { adding.value = undefined })
})

function done() {
  if (!props.route) return
  emit('done', { ...props.route, label: form.label.trim(), items: form.items })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t(route?.id ? 'training.route-editor.edit-route' : 'training.route-editor.new-route')"
    :description="t('training.route-editor.route-help')"
  >
    <template #body>
      <UForm
        id="training-route-form"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ label: form.label, items: form.items })"
        novalidate
        @submit="done"
      >
        <UFormField
          name="label"
          :label="t('training.route-editor.label')"
          :help="t('training.route-editor.label-help')"
          required
        >
          <UInput
            v-model="form.label"
            maxlength="80"
          />
        </UFormField>
        <UFormField
          name="items"
          :label="t('training.route-editor.items')"
          required
        >
          <RecordList
            v-if="form.items.length"
            :label="t('training.route-editor.items')"
          >
            <RecordListItem
              v-for="(item, i) in form.items"
              :key="keyOf(item)"
              :icon="item.kind === 'course' ? 'i-lucide-graduation-cap' : 'i-lucide-badge-check'"
              :name="item.label"
            >
              <IconButton
                icon="i-lucide-x"
                size="sm"
                :label="t('training.route-editor.remove-item', { name: item.label })"
                @click="form.items.splice(i, 1)"
              />
            </RecordListItem>
          </RecordList>
          <USelectMenu
            v-model="adding"
            :items="choices"
            value-key="value"
            :placeholder="t('training.route-editor.add-item')"
            :class="form.items.length ? 'mt-2' : undefined"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('training.session-form.cancel')"
          @click="emit('close')"
        />
        <UButton
          type="submit"
          form="training-route-form"
          :label="t('training.route-editor.done')"
        />
      </div>
    </template>
  </UModal>
</template>
