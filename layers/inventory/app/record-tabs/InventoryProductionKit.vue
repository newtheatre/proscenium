<!-- The Kit tab on a production (S15, INV-17): its pull lists and loans, one per department, each
     opening its loan page, and "Start a pull list" for a department that has none open. -->
<script setup lang="ts">
import type { KitList } from '../../shared/pull-lists'

const props = defineProps<{ recordId: string }>()
const { t } = useT()
const { day } = useDates()
const { data, status, error, refresh, lists, departmentItems, form, refusal, prepare, start, counts } = useProductionKit(() => props.recordId)
const starting = ref(false)

function open() {
  prepare()
  starting.value = true
}
const describe = (l: KitList) => [
  t(`inventory.loan-states.${l.state}`),
  t('inventory.kit.counts', counts(l)),
  t('inventory.kit.due-back', { day: day(l.dueBackOn) }),
].join(' · ')
const validate = () => needs({ departmentId: form.departmentId, startsOn: form.startsOn })
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <div
      v-if="data"
      class="max-w-3xl space-y-4"
    >
      <div
        v-if="data.canStart && departmentItems.length"
        class="flex justify-end"
      >
        <UButton
          icon="i-lucide-plus"
          :label="t('inventory.kit.start')"
          @click="open"
        />
      </div>
      <EmptyState
        v-if="!lists.length"
        icon="i-lucide-hand-helping"
        :title="t('inventory.kit.none')"
        :description="data.canStart ? t('inventory.kit.none-help') : undefined"
      />
      <RecordList
        v-else
        :label="t('inventory.record-tabs.production.label')"
      >
        <RecordListItem
          v-for="l in lists"
          :key="l.id"
          :to="`/console/inventory/loans/${l.id}`"
          icon="i-lucide-list-checks"
          :name="t('inventory.kit.list-name', { department: l.department })"
          :description="describe(l)"
          :muted="['returned', 'declined', 'cancelled'].includes(l.state)"
        />
      </RecordList>
    </div>
    <UModal
      v-model:open="starting"
      :title="t('inventory.kit.start')"
    >
      <template #body>
        <UForm
          id="inventory-start-pull-list"
          class="space-y-4"
          :state="form"
          :validate="validate"
          novalidate
          @submit="start"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="departmentId"
            :label="t('inventory.item.department')"
          >
            <USelect
              v-model="form.departmentId"
              :items="departmentItems"
            />
          </UFormField>
          <UFormField
            name="startsOn"
            :label="t('inventory.kit.starts-on')"
            :help="t('inventory.kit.starts-on-help')"
          >
            <FieldDate v-model="form.startsOn" />
          </UFormField>
          <UFormField
            name="dueBackOn"
            :label="t('inventory.kit.due-back-on')"
            :help="data?.dueBackOn ? t('inventory.kit.due-back-follows', { day: day(data.dueBackOn) }) : t('inventory.kit.due-back-needed')"
          >
            <FieldDate
              v-model="form.dueBackOn"
              :min="form.startsOn || undefined"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="inventory-start-pull-list"
          :label="t('inventory.kit.start')"
        />
      </template>
    </UModal>
  </DataBoundary>
</template>
