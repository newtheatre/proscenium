<!-- One line at the kit desk (S6): tick it, say its condition, and in Return how many came back,
     whether it is lost, and what is wrong when damaged. Going out, it shows what the kit needs of the
     person collecting and whether they meet it, or "not checked" when that could not be asked (K3). -->
<script setup lang="ts">
import type { DeskLine } from '../../shared/desk'
import { CONDITIONS } from '../../shared/states'
import type { DeskMode, LineChoice } from '../composables/useKitDesk'

const props = defineProps<{ line: DeskLine, mode: DeskMode }>()
const choice = defineModel<LineChoice>({ required: true })
const { t } = useT()
const name = computed(() => `${props.line.tag} · ${props.line.name}`)
const conditionItems = computed(() => CONDITIONS.map(c => ({ value: c, label: t(`inventory.conditions.${c}`) })))
const needs = computed(() => props.mode === 'out' ? props.line.needs : [])
const left = computed(() => props.line.quantity - props.line.returnedQuantity)
</script>

<template>
  <li class="flex flex-wrap items-center gap-3 py-3">
    <UCheckbox
      v-model="choice.on"
      :label="name"
      :description="line.tracking === 'counted' ? t('inventory.desk.quantity', { count: mode === 'out' ? line.quantity : left }) : undefined"
      class="min-w-56 flex-1"
    />
    <div class="flex flex-wrap items-center gap-2">
      <StatusBadge
        v-for="need in needs"
        :key="need.ref"
        :tone="!need.checked ? 'neutral' : need.met ? 'success' : 'danger'"
        :label="t(!need.checked ? 'inventory.desk.need-unchecked' : need.met ? 'inventory.desk.need-met' : 'inventory.desk.need-unmet', { need: t(need.label) })"
      />
      <USelect
        v-model="choice.condition"
        :items="conditionItems"
        :aria-label="t('inventory.desk.condition-of', { name })"
        :disabled="choice.lost"
      />
      <template v-if="mode === 'back'">
        <FieldNumber
          v-if="line.tracking === 'counted'"
          v-model="choice.quantity"
          :min="1"
          :max="left"
          :aria-label="t('inventory.desk.how-many', { name })"
        />
        <UCheckbox
          v-model="choice.lost"
          :label="t('inventory.desk.lost')"
        />
      </template>
    </div>
    <UInput
      v-if="mode === 'back' && choice.on && !choice.lost && choice.condition === 'damaged'"
      v-model="choice.fault"
      maxlength="2000"
      :placeholder="t('inventory.desk.what-is-wrong')"
      :aria-label="t('inventory.desk.what-is-wrong-with', { name })"
      class="basis-full"
    />
  </li>
</template>
