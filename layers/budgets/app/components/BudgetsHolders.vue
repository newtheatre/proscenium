<!-- A budget's holders (BC-14): the people who approve spending on its lines, each given the Budget
     holder role on this budget alone, ending at the role's own end. Whoever manages budgets adds and
     removes them here; removing can be undone from the toast. -->
<script setup lang="ts">
interface Holder { id: string, accountId: string, name: string, roleName: string, expiresAt: number | null }

const props = defineProps<{ budgetId: string, holders: Holder[], canManage: boolean }>()
const emit = defineEmits<{ changed: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { day } = useDates()
const toast = useToast()
const { offer } = useUndo()

const adding = ref(false)
const form = reactive({ accountId: undefined as string | undefined })
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(adding, (now) => {
  if (!now) return
  form.accountId = undefined
  refusal.value = null
})
const check = () => needs({ accountId: form.accountId })

async function give(accountId: string) {
  await $api(`/api/budgets/budgets/${props.budgetId}/holders` as string, { method: 'POST', body: { accountId } })
  emit('changed')
}
async function save() {
  refusal.value = null
  try {
    await give(form.accountId!)
    adding.value = false
    toast.add({ title: t('budgets.screens.holders.added'), color: 'success' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
async function remove(h: Holder) {
  try {
    await $api(`/api/budgets/budgets/${props.budgetId}/holders/${h.id}` as string, { method: 'DELETE' })
    offer(t('budgets.screens.holders.removed', { name: h.name }), () => give(h.accountId))
    emit('changed')
  }
  catch (e) {
    const r = toRefusal(e)
    toast.add({ title: r.reason, description: r.remedy, color: 'error' })
  }
}
const describe = (h: Holder) => [h.roleName, h.expiresAt ? t('budgets.screens.holders.until', { day: day(h.expiresAt - 1) }) : null].filter(Boolean).join(' · ')
</script>

<template>
  <PageSection
    :title="t('budgets.screens.holders.title')"
    :description="t('budgets.screens.holders.help')"
  >
    <template
      v-if="canManage"
      #actions
    >
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-user-plus"
        :label="t('budgets.screens.holders.add')"
        @click="adding = true"
      />
    </template>
    <p
      v-if="!holders.length"
      class="text-muted"
    >
      {{ t('budgets.screens.holders.none') }}
    </p>
    <RecordList
      v-else
      :label="t('budgets.screens.holders.title')"
    >
      <RecordListItem
        v-for="h in holders"
        :key="h.id"
        icon="i-lucide-user"
        :name="h.name"
        :description="describe(h)"
      >
        <RowActions
          v-if="canManage"
          :items="[{ label: t('budgets.screens.holders.remove'), icon: 'i-lucide-user-minus', onSelect: () => remove(h) }]"
          :label="t('budgets.screens.holders.actions', { name: h.name })"
        />
      </RecordListItem>
    </RecordList>

    <UModal
      v-model:open="adding"
      :title="t('budgets.screens.holders.add')"
    >
      <template #body>
        <UForm
          id="budgets-holder"
          ref="formEl"
          :state="form"
          :validate="check"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="accountId"
            :label="t('budgets.screens.holders.person')"
            :help="t('budgets.screens.holders.person-help')"
            required
          >
            <PersonPicker
              v-model="form.accountId"
              :endpoint="`/api/budgets/budgets/${budgetId}/people`"
              :exclude="holders.map(h => h.accountId)"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="budgets-holder"
          :loading="formEl?.loading"
          :label="t('budgets.screens.holders.add')"
        />
      </template>
    </UModal>
  </PageSection>
</template>
