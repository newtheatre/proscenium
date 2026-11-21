<!-- Roles (ID-22; identity spec part 6, Admin): every role, how many hold it now and
     what it brings. Defining a role is here; giving one to a person stays in the console. -->
<script setup lang="ts">
interface Role { id: string, key: string, name: string, description: string | null, fixed: boolean, expiryRule: 'year_end' | 'days' | 'none', expiryDays: number | null, archived: boolean, holders: number, abilities: string[] }

const { t } = useT()
const { data, status, error, refresh } = await useAPI<{ roles: Role[] }>('/api/core/roles', { key: 'core:roles' })
const showArchived = ref(false)
const rows = computed(() => (data.value?.roles ?? []).filter(r => !r.archived))
const archived = computed(() => (data.value?.roles ?? []).filter(r => r.archived))
const line = (role: Role) => `${t('core.roles.holders', { count: role.holders })} · ${role.fixed ? t('core.roles.everything') : t('core.roles.ability-count', { count: role.abilities.length })} · ${ends(role)}`

function ends(role: Role): string {
  if (role.expiryRule === 'year_end') return t('core.roles.ends.year-end')
  if (role.expiryRule === 'days') return t('core.roles.ends.days', { days: role.expiryDays ?? 0 })
  return t('core.roles.ends.none')
}
</script>

<template>
  <PageFrame
    :title="t('core.roles.title')"
    :description="t('core.roles.description')"
    width="reading"
  >
    <template #primary>
      <UButton
        :label="t('core.roles.new')"
        icon="i-lucide-plus"
        to="/admin/roles/new"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!rows.length && !archived.length"
        icon="i-lucide-shield-user"
        :title="t('core.roles.empty')"
        :description="t('core.roles.empty-help')"
      />
      <RecordList
        v-else-if="rows.length"
        :label="t('core.roles.title')"
      >
        <RecordListItem
          v-for="role in rows"
          :key="role.id"
          :name="role.name"
          :to="`/admin/roles/${role.id}`"
          :description="line(role)"
        >
          <StatusBadge
            v-if="role.fixed"
            tone="neutral"
            :label="t('core.roles.fixed')"
          />
        </RecordListItem>
      </RecordList>
      <CollapsibleDivider
        v-model:open="showArchived"
        :label="t('core.roles.archived')"
        :count="archived.length"
      >
        <RecordList :label="t('core.roles.archived-list')">
          <RecordListItem
            v-for="role in archived"
            :key="role.id"
            :name="role.name"
            :to="`/admin/roles/${role.id}`"
            :description="line(role)"
            muted
          />
        </RecordList>
      </CollapsibleDivider>
      <UButton
        :label="t('core.roles.who-holds')"
        trailing-icon="i-lucide-arrow-right"
        color="neutral"
        variant="link"
        to="/console/people/grants"
        class="px-0"
      />
    </DataBoundary>
  </PageFrame>
</template>
