<!-- One column of a report being added or changed: a figure from the catalogue, or a formula. -->
<script setup lang="ts">
export interface ColumnEdit { at: number | null, kind: 'figure' | 'formula', measure: string | null, formula: string, label: string }

defineProps<{ figureItems: { value: string, label: string, description: string }[], earlier: string }>()
const emit = defineEmits<{ keep: [] }>()
const editing = defineModel<ColumnEdit | null>({ required: true })

const { t } = useT()
const validate = () => {
  const e = editing.value!
  return e.kind === 'figure' ? needs({ measure: e.measure }) : needs({ label: e.label, formula: e.formula })
}
</script>

<template>
  <UModal
    :open="!!editing"
    :title="t(editing?.kind === 'formula' ? 'reports.builder.formula-title' : 'reports.builder.figure-title')"
    @update:open="v => { if (!v) editing = null }"
  >
    <template #body>
      <UForm
        v-if="editing"
        id="reports-column"
        :attach="false"
        :state="editing"
        :validate="validate"
        class="space-y-4"
        novalidate
        @submit="emit('keep')"
      >
        <UFormField
          v-if="editing.kind === 'figure'"
          :label="t('reports.builder.figure')"
          name="measure"
          required
        >
          <USelectMenu
            :model-value="editing.measure ?? undefined"
            :items="figureItems"
            value-key="value"
            @update:model-value="(v: string) => editing!.measure = v"
          />
        </UFormField>
        <template v-else>
          <UFormField
            :label="t('reports.builder.formula-label')"
            name="label"
            required
          >
            <UInput
              v-model="editing.label"
            />
          </UFormField>
          <UFormField
            :label="t('reports.formula')"
            :help="t('reports.builder.formula-help', { columns: earlier })"
            name="formula"
            required
          >
            <UInput
              v-model="editing.formula"
              class="font-mono"
              :placeholder="t('reports.builder.formula-example')"
            />
          </UFormField>
        </template>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="reports-column"
        :label="t(editing?.at === null ? 'reports.builder.add' : 'reports.builder.keep')"
      />
    </template>
  </UModal>
</template>
