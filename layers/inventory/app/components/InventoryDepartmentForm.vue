<!-- Adding or changing a kit department (INV-05): its name, the tag prefix new items get, who it
     lends to, and what borrowers are told. A new prefix applies only to items added from now on. -->
<script setup lang="ts">
import { LENDS_TO } from '../../shared/states'
import type { Department } from '../../shared/setup'

const props = defineProps<{ department: Department | null }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const { t } = useT()
const { refusal, save } = useInventorySetup('/api/inventory/departments', () => emit('saved'))
const blank = () => ({ name: '', tagPrefix: '', lendsTo: 'members' as Department['lendsTo'], guidance: '', contact: '' })
const form = ref(blank())
const departmentForm = useFormRef('departmentForm')
const lendsToItems = computed(() => LENDS_TO.map(v => ({ value: v, label: t(`inventory.departments.lends-to.${v}`) })))

watch(open, (now) => {
  if (!now) return
  refusal.value = null
  const d = props.department
  form.value = d ? { name: d.name, tagPrefix: d.tagPrefix, lendsTo: d.lendsTo, guidance: d.guidance ?? '', contact: d.contact ?? '' } : blank()
}, { immediate: true })

async function submit() {
  const body = { ...form.value, name: form.value.name.trim(), tagPrefix: form.value.tagPrefix.trim().toUpperCase(), requirements: props.department?.requirements ?? [] }
  const done = t(props.department ? 'inventory.setup.saved' : 'inventory.departments.added', { name: body.name })
  if (await save(props.department?.id ?? null, body, done)) open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="department ? t('inventory.setup.edit-title', { name: department.name }) : t('inventory.departments.add')"
  >
    <template #body>
      <UForm
        id="inventory-department"
        ref="departmentForm"
        class="space-y-4"
        :state="form"
        :validate="() => needs({ name: form.name, tagPrefix: form.tagPrefix })"
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
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            name="tagPrefix"
            :label="t('inventory.departments.prefix')"
            :help="department && department.tagPrefix !== form.tagPrefix.toUpperCase() ? t('inventory.departments.prefix-changed') : t('inventory.departments.prefix-help')"
            required
          >
            <UInput
              v-model="form.tagPrefix"
              maxlength="4"
              class="uppercase"
            />
          </UFormField>
          <UFormField :label="t('inventory.departments.lends-to.label')">
            <USelect
              v-model="form.lendsTo"
              :items="lendsToItems"
            />
          </UFormField>
        </div>
        <UFormField
          :label="t('inventory.departments.contact')"
          :help="t('inventory.departments.contact-help')"
        >
          <UInput
            v-model="form.contact"
            maxlength="200"
          />
        </UFormField>
        <UFormField
          :label="t('inventory.departments.guidance')"
          :help="t('inventory.departments.guidance-help')"
        >
          <UTextarea
            v-model="form.guidance"
            maxlength="2000"
            :rows="3"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="inventory-department"
        :loading="departmentForm?.loading"
        :label="department ? t('inventory.setup.save') : t('inventory.departments.add')"
      />
    </template>
  </UModal>
</template>
