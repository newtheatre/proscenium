<!-- PP-02: an entry typed into the tray. Running time, get-in and get-out are lengths; how many
     performances it wants keeps it in the tray until it has them (W9). -->
<script setup lang="ts">
import { ENTRY_KINDS, ENTRY_LIMITS } from '../../shared/plans'
import type { EntryKind } from '../../shared/plans'

const props = defineProps<{ planId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ added: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const blank = () => ({ title: '', kind: 'own' as EntryKind, minutes: null as number | null, getInMinutes: null as number | null, getOutMinutes: null as number | null, performancesWanted: 1 })
const form = ref(blank())
watch(open, (v) => {
  if (v) {
    form.value = blank()
    refusal.value = null
  }
})
const kinds = computed(() => ENTRY_KINDS.map(value => ({ value, label: t(`programme-planning.entry.kind.${value}`) })))

async function save() {
  refusal.value = null
  try {
    await $api(`/api/programme-planning/plans/${props.planId}/entries` as string, {
      method: 'POST',
      body: { ...form.value, title: form.value.title.trim(), getInMinutes: form.value.getInMinutes ?? 0, getOutMinutes: form.value.getOutMinutes ?? 0 },
    })
    toast.add({ title: t('programme-planning.entry.added', { title: form.value.title.trim() }), color: 'success' })
    emit('added')
    open.value = false
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('programme-planning.entry.add-title')"
    :description="t('programme-planning.entry.add-description')"
  >
    <template #body>
      <UForm
        id="programme-planning-entry"
        ref="formEl"
        :state="form"
        :validate="() => needs({ title: form.title.trim() })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          name="title"
          :label="t('programme-planning.entry.title')"
          :help="t('programme-planning.entry.title-help')"
        >
          <UInput
            v-model="form.title"
            :maxlength="ENTRY_LIMITS.title"
            autofocus
          />
        </UFormField>
        <UFormField
          name="kind"
          :label="t('programme-planning.entry.kind.label')"
        >
          <USelect
            v-model="form.kind"
            :items="kinds"
          />
        </UFormField>
        <UFormField
          name="minutes"
          :label="t('programme-planning.entry.minutes')"
          :help="t('programme-planning.entry.minutes-help')"
        >
          <MinutesInput
            v-model="form.minutes"
            :min="1"
            :max="ENTRY_LIMITS.minutes"
          />
        </UFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            name="getInMinutes"
            :label="t('programme-planning.entry.get-in')"
          >
            <MinutesInput
              v-model="form.getInMinutes"
              :placeholder="0"
              :max="ENTRY_LIMITS.getInOut"
            />
          </UFormField>
          <UFormField
            name="getOutMinutes"
            :label="t('programme-planning.entry.get-out')"
          >
            <MinutesInput
              v-model="form.getOutMinutes"
              :placeholder="0"
              :max="ENTRY_LIMITS.getInOut"
            />
          </UFormField>
        </div>
        <UFormField
          name="performancesWanted"
          :label="t('programme-planning.entry.wanted')"
          :help="t('programme-planning.entry.wanted-help')"
        >
          <FieldNumber
            v-model="form.performancesWanted"
            :min="1"
            :max="ENTRY_LIMITS.wanted"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="programme-planning-entry"
        class="ms-auto"
        :loading="formEl?.loading"
        :label="t('programme-planning.entry.add')"
      />
    </template>
  </UModal>
</template>
