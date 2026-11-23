<!-- The allergen matrix: products down the side, the 14 allergens across the top, a filled dot where a
     product contains one and a ring where it may. Tapping an allergen's heading marks it as one the
     customer avoids (v-model:avoid) and shades its column; each row's `note` then says where the
     product stands. On a phone the product names stay put while the allergens scroll sideways. -->
<script setup lang="ts">
import { ALLERGENS, markOf, type Allergen, type MatrixAnswer } from '../../shared/allergen-matrix'

export interface MatrixRow extends MatrixAnswer {
  key: string
  name: string
  note?: { tone: 'error' | 'warning' | 'success' | 'neutral', text: string } | null
}
export interface MatrixSection { key: string, heading: string | null, rows: MatrixRow[] }

defineProps<{ sections: MatrixSection[], caption: string }>()
const avoid = defineModel<string[]>('avoid', { default: () => [] })

const { t } = useT()
const avoids = (k: Allergen) => avoid.value.includes(k)
function toggle(k: Allergen) {
  avoid.value = avoids(k) ? avoid.value.filter(a => a !== k) : ALLERGENS.filter(a => a === k || avoid.value.includes(a))
}
const ICONS = { error: 'i-lucide-octagon-alert', warning: 'i-lucide-triangle-alert', success: 'i-lucide-check', neutral: 'i-lucide-circle-help' }
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3">
    <div class="min-h-0 overflow-auto overscroll-contain rounded-md border border-default">
      <table class="w-max min-w-full border-separate border-spacing-0 text-sm">
        <caption class="sr-only">
          {{ caption }}
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              class="sticky start-0 top-0 z-30 border-e border-b border-default bg-default p-2 text-start align-bottom font-medium"
            >
              {{ t('bar.matrix.product') }}
            </th>
            <th
              v-for="k in ALLERGENS"
              :key="k"
              scope="col"
              class="sticky top-0 z-20 border-b border-default p-0.5 align-bottom"
              :class="avoids(k) ? 'bg-elevated' : 'bg-default'"
            >
              <UButton
                color="neutral"
                :variant="avoids(k) ? 'solid' : 'ghost'"
                size="sm"
                :aria-pressed="avoids(k)"
                :label="t(`bar.allergen.${k}`)"
                class="w-8 justify-center px-0 py-2"
                :ui="{ label: 'max-h-36 whitespace-normal text-start leading-tight [writing-mode:vertical-rl] rotate-180' }"
                @click="toggle(k)"
              />
            </th>
          </tr>
        </thead>
        <tbody
          v-for="section in sections"
          :key="section.key"
        >
          <tr v-if="section.heading">
            <th
              :colspan="ALLERGENS.length + 1"
              scope="colgroup"
              class="border-b border-default bg-muted p-0 text-start text-xs font-medium text-muted"
            >
              <span class="sticky start-0 inline-block px-2 py-1.5">{{ section.heading }}</span>
            </th>
          </tr>
          <tr
            v-for="row in section.rows"
            :key="row.key"
          >
            <th
              scope="row"
              class="sticky start-0 z-10 w-36 min-w-36 border-e border-b border-default bg-default p-2 text-start align-top font-medium sm:w-48 sm:min-w-48"
            >
              <span class="block">{{ row.name }}</span>
              <UBadge
                v-if="row.note"
                :color="row.note.tone"
                variant="subtle"
                size="sm"
                :icon="ICONS[row.note.tone]"
                :label="row.note.text"
                class="mt-1 max-w-full text-start font-normal"
                :ui="{ label: 'whitespace-normal! overflow-visible! break-words' }"
              />
            </th>
            <td
              v-if="row.checked === 'none'"
              :colspan="ALLERGENS.length"
              class="border-b border-default p-2 align-top text-muted"
            >
              <span class="sticky start-36 sm:start-48">{{ t('bar.matrix.not-checked') }}</span>
            </td>
            <template v-else>
              <td
                v-for="k in ALLERGENS"
                :key="k"
                class="border-b border-s border-default p-0 text-center align-middle first-of-type:border-s-0"
                :class="avoids(k) && 'bg-elevated'"
              >
                <span
                  v-if="markOf(row, k) === 'contains'"
                  class="inline-block size-3.5 rounded-full bg-error align-middle"
                  aria-hidden="true"
                />
                <span
                  v-else-if="markOf(row, k) === 'may-contain'"
                  class="inline-block size-3.5 rounded-full border-2 border-warning align-middle"
                  aria-hidden="true"
                />
                <span
                  v-if="markOf(row, k)"
                  class="sr-only"
                >{{ t(markOf(row, k) === 'contains' ? 'bar.matrix.contains' : 'bar.matrix.may-contain') }}</span>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span class="inline-flex items-center gap-1.5">
        <span
          class="inline-block size-3 rounded-full bg-error"
          aria-hidden="true"
        />{{ t('bar.matrix.contains') }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span
          class="inline-block size-3 rounded-full border-2 border-warning"
          aria-hidden="true"
        />{{ t('bar.matrix.may-contain') }}
      </span>
      <span>{{ t('bar.matrix.blank') }}</span>
    </p>
  </div>
</template>
