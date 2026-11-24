<!-- Adding or changing a category of a kit department (INV-06), with the inspection kinds every
     item in it needs. A kind added falls due for the items already in it (rule N1). -->
<script setup lang="ts">
import type { Category, Department } from '../../shared/setup'

const props = defineProps<{ category: Category | null, department: Department | null, kinds: { id: string, name: string }[] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const { t } = useT()
const { refusal, save } = useInventorySetup('/api/inventory/categories', () => emit('saved'))
const form = ref({ name: '', kindIds: [] as string[] })
const categoryForm = useFormRef('categoryForm')
const kindItems = computed(() => props.kinds.map(k => ({ value: k.id, label: k.name })))

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  form.value = { name: props.category?.name ?? '', kindIds: [...(props.category?.kindIds ?? [])] }
}, { immediate: true })

async function submit() {
  const name = form.value.name.trim()
  const body = { name, kindIds: form.value.kindIds, requirements: props.category?.requirements ?? [], ...(props.category ? {} : { departmentId: props.department?.id }) }
  const done = t(props.category ? 'inventory.setup.saved' : 'inventory.categories.added', { name })
  if (await save(props.category?.id ?? null, body, done)) open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="category ? t('inventory.setup.edit-title', { name: category.name }) : t('inventory.categories.add-to', { department: department?.name ?? '' })"
  >
    <template #body>
      <UForm
        id="inventory-category"
        ref="categoryForm"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ name: form.name })"
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
            maxlength="60"
          />
        </UFormField>
        <UFormField
          :label="t('inventory.categories.kinds')"
          :help="kinds.length ? t('inventory.categories.kinds-help') : t('inventory.categories.no-kinds')"
        >
          <UCheckboxGroup
            v-model="form.kindIds"
            :items="kindItems"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="inventory-category"
        :loading="categoryForm?.loading"
        :label="category ? t('inventory.setup.save') : t('inventory.categories.add')"
      />
    </template>
  </UModal>
</template>
