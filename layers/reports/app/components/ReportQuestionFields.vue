<!-- What a report is about and who sees it: its scope, its dates and the role it is shared with. -->
<script setup lang="ts">
import { PERIOD_RULES, SCOPE_KINDS, type PeriodRule, type ScopeKind } from '../../shared/reports'

const props = defineProps<{ people: boolean, roles: { id: string, name: string }[] }>()
const scopeKind = defineModel<ScopeKind>('scopeKind', { required: true })
const scopeId = defineModel<string | null>('scopeId', { required: true })
const periodRule = defineModel<PeriodRule>('periodRule', { required: true })
const shareRole = defineModel<string | null>('shareRole', { required: true })

const { t } = useT()
const scopeItems = computed(() => SCOPE_KINDS.map(k => ({ value: k, label: t(`reports.builder.scope-kinds.${k}`) })))
const periodItems = computed(() => PERIOD_RULES.filter(r => r !== 'scope' || scopeKind.value !== 'none').map(r => ({ value: r, label: t(`reports.periods.${r}`) })))
const shareItems = (roles: { id: string, name: string }[]) => [{ value: 'none', label: t('reports.builder.share-none') }, ...roles.map(r => ({ value: r.id, label: r.name }))]
const share = computed({ get: () => shareRole.value ?? 'none', set: v => shareRole.value = v === 'none' ? null : v })
</script>

<template>
  <PageSection :title="t('reports.builder.question')">
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        :label="t('reports.builder.scope-kind')"
        name="scopeKind"
      >
        <USelect
          v-model="scopeKind"
          :items="scopeItems"
        />
      </UFormField>
      <UFormField
        v-if="scopeKind !== 'none'"
        :label="t('reports.builder.scope-id', { kind: t(`reports.scopes.${scopeKind}`).toLowerCase() })"
        :help="t('reports.builder.scope-id-help')"
        name="scopeId"
      >
        <FieldRecord
          v-model="scopeId"
          :record="`core.${scopeKind}`"
        />
      </UFormField>
      <UFormField
        :label="t('reports.period')"
        name="periodRule"
      >
        <USelect
          v-model="periodRule"
          :items="periodItems"
        />
      </UFormField>
      <UFormField
        v-if="!people"
        :label="t('reports.builder.share')"
        :help="t('reports.builder.share-help')"
        name="shareRole"
      >
        <USelect
          v-model="share"
          :items="shareItems(props.roles)"
        />
      </UFormField>
    </div>
  </PageSection>
</template>
