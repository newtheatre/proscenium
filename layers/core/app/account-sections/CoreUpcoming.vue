<!-- "Coming up" on My account's overview (AC-3): the next few things the person has, from every
     module that contributes to core.upcoming (tickets, shifts), soonest first. Absent when there is
     nothing coming. -->
<script setup lang="ts">
interface Item { key: string, at: number, icon: string, title: string | null, label: string, params?: Record<string, string | number>, to?: string }

const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { dateTime } = useDates()
const { data } = await useAPI<{ items: Item[] }>('/api/core/me/upcoming', { key: 'core:my-upcoming', default: () => ({ items: [] }) })
const items = computed(() => data.value?.items ?? [])
</script>

<template>
  <UCard
    v-if="items.length"
    as="section"
    :aria-labelledby="props.headingId"
    class="lg:col-span-2"
  >
    <template #header>
      <h3
        :id="props.headingId"
        class="flex items-center gap-2 font-semibold text-highlighted"
      >
        <UIcon
          name="i-lucide-calendar-days"
          class="size-5 text-primary"
        />
        {{ t('core.account.upcoming.title') }}
      </h3>
    </template>
    <RecordList
      :label="t('core.account.upcoming.title')"
    >
      <RecordListItem
        v-for="item in items"
        :key="item.key"
        :to="item.to"
        :icon="item.icon"
        :name="item.title ?? t(item.label, item.params ?? {})"
        :description="item.title ? `${t(item.label, item.params ?? {})} · ${dateTime(item.at)}` : dateTime(item.at)"
      />
    </RecordList>
  </UCard>
</template>
