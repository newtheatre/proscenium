<!-- Roles (ID-22; identity spec part 6, Admin): every role, how many hold it now and
     what it brings. Defining a role is here; giving one to a person stays in the console. -->
<script setup lang="ts">
interface Role { id: string, key: string, name: string, description: string | null, fixed: boolean, expiryRule: 'year_end' | 'days' | 'none', expiryDays: number | null, archived: boolean, holders: number, abilities: string[] }

const { t } = useT()
const { data, status, error, refresh } = await useAPI<{ roles: Role[] }>('/api/core/roles', { key: 'core:roles' })
const showArchived = ref(false)
const rows = computed(() => (data.value?.roles ?? []).filter(r => showArchived.value || !r.archived))
const archivedCount = computed(() => (data.value?.roles ?? []).filter(r => r.archived).length)

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
        v-if="!rows.length"
        icon="i-lucide-shield-user"
        :title="t('core.roles.empty')"
        :description="t('core.roles.empty-help')"
      />
      <RecordList
        v-else
        :label="t('core.roles.title')"
      >
        <RecordListItem
          v-for="role in rows"
          :key="role.id"
          :name="role.name"
          :to="`/admin/roles/${role.id}`"
          :muted="role.archived"
          :description="`${t('core.roles.holders', { count: role.holders })} · ${role.fixed ? t('core.roles.everything') : t('core.roles.ability-count', { count: role.abilities.length })} · ${ends(role)}`"
        >
          <StatusBadge
            v-if="role.fixed"
            tone="neutral"
            :label="t('core.roles.fixed')"
          />
          <StatusBadge
            v-else-if="role.archived"
            tone="neutral"
            :label="t('core.roles.archived')"
          />
        </RecordListItem>
      </RecordList>
      <UButton
        v-if="archivedCount"
        variant="link"
        color="neutral"
        :label="showArchived ? t('core.roles.hide-archived') : t('core.roles.show-archived', { count: archivedCount })"
        @click="showArchived = !showArchived"
      />
    </DataBoundary>
  </PageFrame>
</template>
