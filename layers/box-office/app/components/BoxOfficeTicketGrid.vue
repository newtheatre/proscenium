<!-- The price list a show's tickets and a ticket preset share (show walkthrough, decisions 1, 2 and 4):
     one row for each ticket type with a typed price, where a blank price means not sold. A show is
     priced the same across the house unless "Different prices for parts of the house" is on; then
     each section (Stalls, Balcony) is a column with its name and its seats, and can be removed. -->
<script setup lang="ts">
export interface GridType { id: string, name: string, hint?: string | null }
export interface GridSection { key: string, id?: string | null, name: string, seats: number | null, prices: Record<string, number | null> }

defineProps<{ types: GridType[], disabled?: boolean, seatsHelp?: string }>()
const sections = defineModel<GridSection[]>({ required: true })
const { t } = useT()

let made = 0
const fresh = (name = ''): GridSection => ({ key: `new-${++made}`, id: null, name, seats: null, prices: {} })

const sectioned = computed({
  get: () => sections.value.length > 1,
  set: (on: boolean) => {
    if (on) {
      sections.value = [{ ...sections.value[0]!, name: sections.value[0]!.name || t('box-office.tickets.section.first') }, fresh()]
    }
    else {
      sections.value = [{ ...sections.value[0]!, name: '', seats: null }]
    }
  },
})

function add() {
  // A new section starts with the first one's prices, which is usually nearly right.
  sections.value = [...sections.value, { ...fresh(), prices: { ...sections.value[0]?.prices } }]
}
function remove(key: string) {
  const left = sections.value.filter(s => s.key !== key)
  sections.value = left.length === 1 ? [{ ...left[0]!, name: '', seats: null }] : left
}
function setPrice(section: GridSection, typeId: string, amount: number | null) {
  sections.value = sections.value.map(s => s.key === section.key ? { ...s, prices: { ...s.prices, [typeId]: amount } } : s)
}
function setField(section: GridSection, field: 'name' | 'seats', value: string | number | null) {
  sections.value = sections.value.map(s => s.key === section.key ? { ...s, [field]: value } : s)
}
</script>

<template>
  <div class="space-y-4">
    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="border-b border-default text-left align-bottom">
            <th
              scope="col"
              class="py-2 pe-4 font-medium"
            >
              {{ t('box-office.tickets.grid.ticket') }}
            </th>
            <th
              v-for="(s, i) in sections"
              :key="s.key"
              scope="col"
              class="py-2 pe-4 font-medium"
            >
              <span v-if="!sectioned">{{ t('box-office.tickets.grid.price') }}</span>
              <div
                v-else
                class="flex min-w-44 flex-col gap-1.5"
              >
                <div class="flex items-center gap-1">
                  <UInput
                    :model-value="s.name"
                    :placeholder="t('box-office.tickets.section.name-placeholder')"
                    :aria-label="t('box-office.tickets.section.name', { n: i + 1 })"
                    :disabled="disabled"
                    maxlength="60"
                    size="sm"
                    @update:model-value="setField(s, 'name', String($event))"
                  />
                  <IconButton
                    icon="i-lucide-x"
                    size="sm"
                    :label="t('box-office.tickets.section.remove', { name: s.name || i + 1 })"
                    :disabled="disabled"
                    @click="remove(s.key)"
                  />
                </div>
                <UInputNumber
                  :model-value="s.seats ?? undefined"
                  :min="0"
                  :placeholder="t('box-office.tickets.section.seats-placeholder')"
                  :aria-label="t('box-office.tickets.section.seats', { name: s.name || i + 1 })"
                  :increment="false"
                  :decrement="false"
                  :disabled="disabled"
                  size="sm"
                  @update:model-value="setField(s, 'seats', $event ?? null)"
                />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="type in types"
            :key="type.id"
            class="border-b border-default last:border-0"
          >
            <th
              scope="row"
              class="py-2 pe-4 text-left font-normal"
            >
              <span class="block">{{ type.name }}</span>
              <span
                v-if="type.hint"
                class="block text-xs text-muted"
              >{{ type.hint }}</span>
            </th>
            <td
              v-for="s in sections"
              :key="s.key"
              class="py-2 pe-4"
            >
              <FieldMoney
                :model-value="s.prices[type.id] ?? null"
                :steppers="false"
                :disabled="disabled"
                :placeholder="t('box-office.tickets.grid.not-sold')"
                :aria-label="sectioned ? t('box-office.tickets.grid.price-in', { type: type.name, section: s.name }) : t('box-office.tickets.grid.price-of', { type: type.name })"
                class="w-32"
                @update:model-value="setPrice(s, type.id, $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <!-- Always shown: a line that came and went as prices were typed would move the switch below it
         under the pointer, and in a centred dialog would move everything. -->
    <p class="text-sm text-muted">
      {{ t('box-office.tickets.grid.unpriced') }}
    </p>
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
      <USwitch
        v-model="sectioned"
        :label="t('box-office.tickets.section.toggle')"
        :description="t('box-office.tickets.section.toggle-help')"
        :disabled="disabled"
      />
      <UButton
        v-if="sectioned"
        :label="t('box-office.tickets.section.add')"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        size="sm"
        :disabled="disabled"
        @click="add"
      />
    </div>
    <p
      v-if="sectioned && seatsHelp"
      class="text-xs text-muted"
    >
      {{ seatsHelp }}
    </p>
  </div>
</template>
