<!-- Rule E2: an existing draft production of the season, brought onto the board already accepted. -->
<script setup lang="ts">
import { ENTRY_LIMITS } from '../../shared/plans'

interface Bringable { id: string, title: string, kind: string, runningMinutes: number | null }

const props = defineProps<{ planId: string }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ added: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { formEl, refusal, toRefusal, submit } = usePlanDialog(open, () => emit('added'))
const productions = ref<Bringable[] | null>(null)
const form = ref({ productionId: undefined as string | undefined, performancesWanted: 1 })

watch(open, async (v) => {
  if (!v) return
  form.value = { productionId: undefined, performancesWanted: 1 }
  refusal.value = null
  productions.value = null
  try {
    productions.value = (await $api<{ productions: Bringable[] }>(`/api/programme-planning/plans/${props.planId}/productions` as string)).productions
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
})
const items = computed(() => (productions.value ?? []).map(p => ({ value: p.id, label: p.title })))
const chosen = computed(() => productions.value?.find(p => p.id === form.value.productionId))

function save() {
  return submit(
    () => $api(`/api/programme-planning/plans/${props.planId}/bring` as string, { method: 'POST', body: form.value }),
    t('programme-planning.entry.brought', { title: chosen.value?.title ?? '' }),
  )
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('programme-planning.entry.bring-title')"
    :description="t('programme-planning.entry.bring-description')"
  >
    <template #body>
      <RefusalNotice :refusal="refusal" />
      <p
        v-if="productions && !productions.length"
        class="text-sm text-muted"
      >
        {{ t('programme-planning.entry.bring-none') }}
      </p>
      <UForm
        v-else
        id="programme-planning-bring"
        ref="formEl"
        :state="form"
        :validate="() => needs({ productionId: form.productionId })"
        class="space-y-4"
        novalidate
        @submit="save"
      >
        <UFormField
          name="productionId"
          :label="t('programme-planning.entry.production')"
        >
          <USelectMenu
            v-model="form.productionId"
            :items="items"
            value-key="value"
            :loading="!productions"
            :placeholder="t('programme-planning.entry.production-placeholder')"
          />
        </UFormField>
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
    <template
      v-if="productions?.length"
      #footer
    >
      <UButton
        type="submit"
        form="programme-planning-bring"
        class="ms-auto"
        :loading="formEl?.loading"
        :label="t('programme-planning.entry.bring')"
      />
    </template>
  </UModal>
</template>
