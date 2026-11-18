<!-- Facts (ID-22; identity spec part 6): each fact a module declares, such as "leads tonight's
     shift", with the abilities the theatre maps to it, edited the same way as a role. Whoever the
     fact names holds those abilities while it holds. A privileged one needs the theatre's confirmation. -->
<script setup lang="ts">
import type { CatalogueAbility } from '../../components/AbilityPicker.vue'

interface Fact { name: string, module: string, on: string | null, standing: boolean, label: string, abilities: { ability: string, confirmed: boolean }[] }

const { t, te } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ facts: Fact[], catalogue: CatalogueAbility[] }>('/api/core/facts', { key: 'core:facts' })

const drafts = reactive<Record<string, string[]>>({})
const confirmations = reactive<Record<string, boolean>>({})
const refusals = reactive<Record<string, ReturnType<typeof toRefusal> | null>>({})
watch(data, (d) => {
  for (const fact of d?.facts ?? []) drafts[fact.name] = fact.abilities.map(a => a.ability)
}, { immediate: true })

// A fact a module has not named reads as its module and its words, never as a raw id (L13).
const nameOf = (fact: Fact) => te(fact.label)
  ? t(fact.label)
  : `${te(`${fact.module}.module.name`) ? t(`${fact.module}.module.name`) : fact.module}: ${fact.name.slice(fact.module.length + 1).replace(/-/g, ' ')}`
const confirmedOf = (fact: Fact) => fact.abilities.filter(a => a.confirmed).map(a => a.ability)
const privileged = computed(() => new Set((data.value?.catalogue ?? []).filter(a => a.risk === 'privileged').map(a => a.name)))
// Each fact offers first the abilities that fit it: its own module's, and those on the record type the
// fact is about or on anything under it (a fact on a performance: admitting to it, its rota). A fact
// about no record offers site-wide abilities of normal risk. "Show every ability" offers the rest.
const everything = reactive<Record<string, boolean>>({})
function fits(fact: Fact) {
  return (ability: CatalogueAbility) => ability.module === fact.module
    || (fact.on ? !!ability.within?.includes(fact.on) : !ability.on && ability.risk === 'normal')
}
const hiddenCount = (fact: Fact) => (data.value?.catalogue ?? []).filter(a => !fits(fact)(a) && !(drafts[fact.name] ?? []).includes(a.name)).length

/** Privileged abilities ticked for this fact that the theatre has not confirmed yet. */
const unconfirmed = (fact: Fact) => (drafts[fact.name] ?? []).filter(a => privileged.value.has(a) && !confirmedOf(fact).includes(a))

async function save(fact: Fact) {
  refusals[fact.name] = null
  try {
    await $api(`/api/core/facts/${encodeURIComponent(fact.name)}` as '/api/core/facts/:fact', { method: 'PUT', body: { abilities: drafts[fact.name] ?? [], confirmPrivileged: !!confirmations[fact.name] } })
    toast.add({ title: t('core.facts.saved', { fact: nameOf(fact) }), color: 'success' })
    confirmations[fact.name] = false
    await refresh()
  }
  catch (e) {
    refusals[fact.name] = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="t('core.facts.title')"
    :description="t('core.facts.description')"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.facts.length"
        icon="i-lucide-badge-check"
        :title="t('core.facts.empty')"
      />
      <PageSection
        v-for="fact in data?.facts ?? []"
        :key="fact.name"
        :title="nameOf(fact)"
        :description="fact.standing ? t('core.facts.standing') : undefined"
      >
        <RefusalNotice :refusal="refusals[fact.name] ?? null" />
        <AbilityPicker
          v-if="data && drafts[fact.name]"
          v-model="drafts[fact.name]!"
          :catalogue="data.catalogue"
          :confirmed="confirmedOf(fact)"
          :shown="everything[fact.name] ? undefined : fits(fact)"
        />
        <USwitch
          v-if="hiddenCount(fact)"
          v-model="everything[fact.name]"
          :label="t('core.facts.show-all', { count: hiddenCount(fact) })"
        />
        <UCheckbox
          v-if="unconfirmed(fact).length"
          v-model="confirmations[fact.name]"
          :label="t('core.facts.confirm')"
          :description="t('core.facts.confirm-help')"
        />
        <UButton
          :label="t('core.facts.save')"
          loading-auto
          @click="save(fact)"
        />
      </PageSection>
    </DataBoundary>
  </PageFrame>
</template>
