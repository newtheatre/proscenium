<!-- Adding or changing an inspection kind (INV-08). A new interval moves the next due date of every
     item already inspected, from its last pass (rule N10). -->
<script setup lang="ts">
import { CERTIFICATE } from '../../shared/states'
import type { Kind } from '../../shared/setup'

const props = defineProps<{ kind: Kind | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const { t } = useT()
const { refusal, save } = useInventorySetup('/api/inventory/inspection-kinds', () => emit('saved'))
const blank = () => ({ name: '', description: '', intervalDays: null as number | null, certificate: 'optional' as Kind['certificate'], contractorAllowed: true, blocksWhenOverdue: true })
const form = ref(blank())
const kindForm = useFormRef('kindForm')
const certificateItems = computed(() => CERTIFICATE.map(v => ({ value: v, label: t(`inventory.kinds.certificate.${v}`) })))

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  const k = props.kind
  form.value = k ? { name: k.name, description: k.description ?? '', intervalDays: k.intervalDays, certificate: k.certificate, contractorAllowed: k.contractorAllowed, blocksWhenOverdue: k.blocksWhenOverdue } : blank()
}, { immediate: true })

async function submit() {
  const body = { ...form.value, name: form.value.name.trim(), inspectorRequirements: props.kind?.inspectorRequirements ?? [] }
  const done = t(props.kind ? 'inventory.setup.saved' : 'inventory.kinds.added', { name: body.name })
  if (await save(props.kind?.id ?? null, body, done)) open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="kind ? t('inventory.setup.edit-title', { name: kind.name }) : t('inventory.kinds.add')"
  >
    <template #body>
      <UForm
        id="inventory-kind"
        ref="kindForm"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ name: form.name, intervalDays: form.intervalDays })"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="name"
          :label="t('inventory.setup.name')"
          required
        >
          <UInput
            v-model="form.name"
            maxlength="80"
          />
        </UFormField>
        <UFormField
          :label="t('inventory.kinds.about')"
          :help="t('inventory.kinds.about-help')"
        >
          <UTextarea
            v-model="form.description"
            maxlength="2000"
            :rows="2"
          />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            name="intervalDays"
            :label="t('inventory.kinds.interval')"
            :help="kind && kind.intervalDays !== form.intervalDays ? t('inventory.kinds.interval-changed') : t('inventory.kinds.interval-help')"
            required
          >
            <FieldNumber
              v-model="form.intervalDays"
              :min="1"
              :max="3650"
            />
          </UFormField>
          <UFormField :label="t('inventory.kinds.certificate.label')">
            <USelect
              v-model="form.certificate"
              :items="certificateItems"
            />
          </UFormField>
        </div>
        <UCheckbox
          v-model="form.contractorAllowed"
          :label="t('inventory.kinds.contractor')"
          :description="t('inventory.kinds.contractor-help')"
        />
        <UCheckbox
          v-model="form.blocksWhenOverdue"
          :label="t('inventory.kinds.blocks')"
          :description="t('inventory.kinds.blocks-help')"
        />
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="inventory-kind"
        :loading="kindForm?.loading"
        :label="kind ? t('inventory.setup.save') : t('inventory.kinds.add')"
      />
    </template>
  </UModal>
</template>
