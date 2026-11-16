<!-- One role (ID-22; identity spec part 6): its name, description, when grants of it end, whether
     it opens the members' area, and the abilities it brings, grouped by module. `new` makes one.
     The Owner role brings everything and cannot be changed. Who holds it is in the console. -->
<script setup lang="ts">
import { roleInput } from '../../../../server/identity/inputs'
import type { CatalogueAbility } from '../../../components/AbilityPicker.vue'

interface Role { id: string, key: string, name: string, description: string | null, fixed: boolean, opensMembersArea: boolean, expiryRule: 'year_end' | 'days' | 'none', expiryDays: number | null, archived: boolean, holders: number, abilities: string[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const route = useRoute()
const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'new')
const { data, status, error, refresh } = await useAPI<{ roles: Role[], catalogue: CatalogueAbility[] }>('/api/core/roles', { key: 'core:roles' })
const role = computed(() => data.value?.roles.find(r => r.id === id.value))
const readOnly = computed(() => !!role.value?.fixed || !!role.value?.archived)

const form = reactive({ name: '', description: '', expiryRule: 'year_end' as Role['expiryRule'], expiryDays: null as number | null, opensMembersArea: true, abilities: [] as string[] })
watch(role, (r) => {
  if (!r) return
  Object.assign(form, { name: r.name, description: r.description ?? '', expiryRule: r.expiryRule, expiryDays: r.expiryDays, opensMembersArea: r.opensMembersArea, abilities: [...r.abilities] })
}, { immediate: true })

const expiryOptions = computed(() => [
  { value: 'year_end', label: t('core.roles.ends.year-end') },
  { value: 'days', label: t('core.roles.ends.after-days') },
  { value: 'none', label: t('core.roles.ends.none') },
])
const title = computed(() => isNew.value ? t('core.roles.new') : (role.value?.name ?? t('core.roles.role')))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const saving = ref(false)

async function save() {
  refusal.value = null
  saving.value = true
  const body = { ...form, description: form.description.trim() || null, expiryDays: form.expiryRule === 'days' ? form.expiryDays : null }
  try {
    if (isNew.value) {
      const made = await $api<{ id: string }>('/api/core/roles', { method: 'POST', body })
      toast.add({ title: t('core.roles.created', { name: form.name }), color: 'success' })
      await refresh()
      await navigateTo(`/admin/roles/${made.id}`, { replace: true })
    }
    else {
      await $api(`/api/core/roles/${id.value}` as '/api/core/roles/:id', { method: 'PUT', body })
      toast.add({ title: t('core.roles.saved'), color: 'success' })
      await refresh()
    }
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}

async function archive() {
  if (!role.value) return
  const holders = role.value.holders
  if (!await confirm({ verb: t('core.roles.archive'), thing: role.value.name, consequence: holders ? t('core.roles.archive-ends', { count: holders }) : t('core.roles.archive-none'), button: t('core.roles.archive') })) return
  refusal.value = null
  try {
    await $api(`/api/core/roles/${id.value}/archive` as '/api/core/roles/:id/archive', { method: 'POST', body: {} })
    toast.add({ title: t('core.roles.archived-toast', { name: role.value.name }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="title"
    width="reading"
  >
    <template #status>
      <StatusBadge
        v-if="role?.fixed"
        tone="neutral"
        :label="t('core.roles.fixed')"
      />
      <StatusBadge
        v-else-if="role?.archived"
        tone="neutral"
        :label="t('core.roles.archived')"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!isNew && !role"
        icon="i-lucide-shield-question"
        :title="t('core.roles.missing')"
      />
      <UForm
        v-else
        :schema="roleInput"
        :state="{ ...form, description: form.description.trim() || null, expiryDays: form.expiryRule === 'days' ? form.expiryDays : null }"
        :disabled="readOnly"
        class="space-y-6"
        @submit="save"
      >
        <RefusalNotice :refusal="refusal" />
        <UAlert
          v-if="role?.fixed"
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          :title="t('core.roles.owner-fixed')"
        />

        <PageSection :title="t('core.roles.about')">
          <UFormField
            name="name"
            :label="t('core.roles.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="description"
            :label="t('core.roles.what-for')"
          >
            <UTextarea
              v-model="form.description"
              maxlength="500"
              :rows="2"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="expiryRule"
            :label="t('core.roles.ends.label')"
            :help="t('core.roles.ends.help')"
          >
            <URadioGroup
              v-model="form.expiryRule"
              :items="expiryOptions"
            />
          </UFormField>
          <UFormField
            v-if="form.expiryRule === 'days'"
            name="expiryDays"
            :label="t('core.roles.ends.days-label')"
          >
            <UInputNumber
              v-model="form.expiryDays"
              :min="1"
              :max="3650"
            />
          </UFormField>
          <UFormField name="opensMembersArea">
            <USwitch
              v-model="form.opensMembersArea"
              :label="t('core.roles.opens-members')"
              :description="t('core.roles.opens-members-help')"
            />
          </UFormField>
        </PageSection>

        <PageSection
          :title="t('core.roles.abilities')"
          :description="t('core.roles.abilities-help')"
        >
          <AbilityPicker
            v-if="data"
            v-model="form.abilities"
            :catalogue="data.catalogue"
            :disabled="readOnly"
          />
        </PageSection>

        <PageSection
          v-if="role"
          :title="t('core.roles.who')"
        >
          <p class="text-sm">
            {{ t('core.roles.holders', { count: role.holders }) }}
          </p>
          <UButton
            variant="link"
            color="neutral"
            trailing-icon="i-lucide-arrow-right"
            :label="t('core.roles.who-link')"
            :to="`/console/people/grants?roleId=${role.id}`"
          />
        </PageSection>

        <div
          v-if="!readOnly"
          class="flex flex-wrap gap-3"
        >
          <UButton
            type="submit"
            :loading="saving"
            :label="isNew ? t('core.roles.create') : t('core.roles.save')"
          />
          <UButton
            v-if="role"
            color="error"
            variant="outline"
            :label="t('core.roles.archive')"
            @click="archive"
          />
        </div>
      </UForm>
    </DataBoundary>
  </PageFrame>
</template>
